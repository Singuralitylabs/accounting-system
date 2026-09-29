"use server";

import { getActiveSelectOptionsByType } from "./selectOptionsCache";
import { createServerSupabase } from "./clients";
import { UNIQUE_VIOLATION } from "./errorCodes";
import { fetchAllPages } from "./paging";

// Per-type wrapper over getActiveSelectOptionsByType (one join query + per-request cache).
export const getSelectOptions = async (typeName: string) => {
  const { optionsByType, error } = await getActiveSelectOptionsByType([
    typeName,
  ]);

  return { options: optionsByType[typeName] ?? [], error };
};

export const insertSelectOption = async (
  typeName: string,
  value: string,
  display_order: number
) => {
  const supabase = createServerSupabase();

  const { data: typeData, error: typeError } = await supabase
    .from("select_option_types")
    .select("id")
    .eq("name", typeName)
    .single();

  if (typeError || !typeData) {
    console.error(`選択肢の種類の取得に失敗しました: ${typeName}`, typeError);
    return false;
  }

  const { error } = await supabase.from("select_options").insert({
    type_id: typeData.id,
    value,
    display_order,
    is_active: true,
  });

  if (error) {
    console.error(`選択肢の追加に失敗しました`, error);
    return false;
  }

  return true;
};

export const updateSelectOption = async (
  id: number,
  value: string,
  display_order: number,
  is_active: boolean
) => {
  const supabase = createServerSupabase();

  const { error } = await supabase
    .from("select_options")
    .update({
      value,
      display_order,
      is_active,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) {
    console.error(`選択肢の更新に失敗しました: ${id}`, error);
    return false;
  }

  return true;
};

// Maps the client's temporary id to the DB id (a reactivated deleted row gets the existing row's id).
export type InsertedSelectOptionId = { tempId: number; id: number };

export type BulkUpsertSelectOptionsResult = {
  // Ids of added rows (INSERT or reactivation). Includes those added before a mid-save failure so the
  // UI swaps in DB ids and re-saving does not add them again.
  insertedIds: InsertedSelectOptionId[];
  // Existing rows actually updated (1 row). Lets the UI fold saved rows into its baseline after a
  // mid-save failure.
  updatedIds: number[];
  // Message shown on failure (some rows may already be saved).
  error?: string;
};

// The UI (SelectOptionList) sends only changed existing rows and added rows.
export type SelectOptionToSave = {
  id: number;
  value: string;
  display_order: number | null;
  is_active: boolean | null;
  isNew: boolean;
  // false: only order / active changed, UPDATEd in parallel; otherwise (including omitted) one by one.
  valueChanged?: boolean;
};

// UNIQUE(type_id, value) also applies to deleted (inactive) rows.
const DUPLICATE_VALUE_MESSAGE = (value: string) =>
  `「${value}」と同じ名前の項目が既にあります（削除済みの項目を含む）。名前を変えるか、既存の項目を使ってください。`;

// Another admin added the same name concurrently during the insert.
const CONCURRENT_INSERT_MESSAGE =
  "同じ名前の項目が同時に追加された可能性があります。画面を再読み込みして、もう一度保存してください。";

// 0 rows updated (RLS-rejected, or deleted by another admin).
const NOT_UPDATED_MESSAGE =
  "更新できなかった項目があります（削除されたか、更新する権限がありません）。画面を再読み込みしてください。";

const UPDATE_FAILED_MESSAGE = "項目の更新に失敗しました。";

// Per-card save from the item management screen. isNew rows (temporary ids) are inserted, others
// UPDATEd; rows added and deleted before saving (isNew and is_active = false) are not sent.
//
// Order invariant: UPDATE existing rows first, then insert. UNIQUE(type_id, value) also covers deleted
// rows, so the reverse order would violate it when renaming an item and adding the old name in the
// same save, or deleting an item and adding the same name.
//
// If an added name matches a deleted row (INSERT hits 23505), that row is reactivated (order = the
// added row's position); a clash with an active row returns a clear message (also for UPDATE renames
// onto a deleted row or swaps).
//
// Insert in one INSERT ... RETURNING first (one round trip). Only on 23505 (the batch fails
// entirely, nothing added) fetch the type's existing rows once and split into new INSERTs and
// reactivations (parallel). Temporary and DB ids are mapped one-to-one by value, since RETURNING
// order is not guaranteed to match input. The UI swaps in DB ids, so a save before router.refresh
// arrives does not add rows again.
export const bulkUpsertSelectOptions = async (
  typeName: string,
  options: SelectOptionToSave[]
): Promise<BulkUpsertSelectOptionsResult> => {
  const supabase = createServerSupabase();
  const fallbackOrder = options.length;
  const insertedIds: InsertedSelectOptionId[] = [];
  const updatedIds: number[] = [];

  const newOptions = options.filter(
    (option) => option.isNew && option.is_active
  );
  const updateOptions = options.filter((option) => !option.isNew);

  // 23505 is deferred.
  const updateOption = async (
    option: SelectOptionToSave
  ): Promise<
    | { status: "updated" }
    | { status: "deferred" }
    | { status: "failed"; message: string }
  > => {
    const { data, error } = await supabase
      .from("select_options")
      .update({
        value: option.value,
        display_order: option.display_order || fallbackOrder,
        is_active: option.is_active!,
        updated_at: new Date().toISOString(),
      })
      .eq("id", option.id)
      .select("id");
    if (error?.code === UNIQUE_VIOLATION) return { status: "deferred" };
    if (error) {
      console.error(`選択肢の更新に失敗しました: ${option.id}`, error);
      return { status: "failed", message: UPDATE_FAILED_MESSAGE };
    }
    if (!data || data.length === 0) {
      console.error(
        `選択肢の更新に失敗しました（更新できた行が 0 行）: ${option.id}`
      );
      return { status: "failed", message: NOT_UPDATED_MESSAGE };
    }
    return { status: "updated" };
  };

  // Rows whose name is unchanged (only order / active changed) have no ordering constraints and go in
  // parallel (a 23505 there is deferred and retried like renames). On any failure, wait for the others
  // (include updated ids in updatedIds) and return the error without renaming/adding.
  const parallelOptions = updateOptions.filter(
    (option) => option.valueChanged === false
  );
  const parallelResults = await Promise.all(parallelOptions.map(updateOption));
  const deferredFromParallel: SelectOptionToSave[] = [];
  let parallelError: string | undefined;
  parallelResults.forEach((result, index) => {
    const option = parallelOptions[index];
    if (result.status === "updated") updatedIds.push(option.id);
    else if (result.status === "deferred") deferredFromParallel.push(option);
    else parallelError ??= result.message;
  });
  if (parallelError) return { insertedIds, updatedIds, error: parallelError };

  // Renamed rows are UPDATEd one by one: in parallel, chained renames (P->Q and Q->R) can violate
  // UNIQUE depending on execution order. 23505 rows are deferred and retried as others progress
  // (Q->R first lets P->Q pass). If a pass makes no progress, the name clashes with a deleted row or
  // is a swap (not possible in one save): return a clear message. Non-23505 failures or 0 rows updated
  // (RLS-rejected / deleted by another admin) stop immediately, are logged and returned.
  let pendingUpdates = [
    ...updateOptions.filter((option) => option.valueChanged !== false),
    ...deferredFromParallel,
  ];
  while (pendingUpdates.length > 0) {
    const deferred: typeof pendingUpdates = [];
    for (const option of pendingUpdates) {
      const result = await updateOption(option);
      if (result.status === "deferred") {
        deferred.push(option);
        continue;
      }
      if (result.status === "failed") {
        return { insertedIds, updatedIds, error: result.message };
      }
      updatedIds.push(option.id);
    }
    if (deferred.length === pendingUpdates.length) {
      return {
        insertedIds,
        updatedIds,
        error: DUPLICATE_VALUE_MESSAGE(deferred[0].value),
      };
    }
    pendingUpdates = deferred;
  }

  if (newOptions.length > 0) {
    const { data: typeData, error: typeError } = await supabase
      .from("select_option_types")
      .select("id")
      .eq("name", typeName)
      .single();

    if (typeError || !typeData) {
      console.error(
        `選択肢の種類の取得に失敗しました: ${typeName}`,
        typeError
      );
      return {
        insertedIds,
        updatedIds,
        error: "選択肢の種類の取得に失敗しました。",
      };
    }

    const toInsertRow = (option: SelectOptionToSave) => ({
      type_id: typeData.id,
      value: option.value,
      display_order: option.display_order || fallbackOrder,
      is_active: true,
    });
    const addFailed = (): BulkUpsertSelectOptionsResult => ({
      insertedIds,
      updatedIds,
      error: "項目の追加に失敗しました。",
    });
    // A successful batch INSERT has distinct names (UNIQUE), so ids map to value one-to-one.
    const recordInserted = (
      inserted: { id: number; value: string }[],
      targets: SelectOptionToSave[]
    ) => {
      const idByValue = new Map(inserted.map((row) => [row.value, row.id]));
      for (const option of targets) {
        const id = idByValue.get(option.value);
        if (id !== undefined) insertedIds.push({ tempId: option.id, id });
      }
    };

    // One INSERT succeeds or fails as a whole (never partially added).
    const { data: bulkData, error: bulkError } = await supabase
      .from("select_options")
      .insert(newOptions.map(toInsertRow))
      .select("id, value");

    if (!bulkError && bulkData) {
      // The INSERT succeeded: always record returned rows in insertedIds, or the UI keeps temporary ids
      // and re-saving re-adds the same name (duplicate error).
      recordInserted(bulkData, newOptions);
      if (bulkData.length === newOptions.length) {
        return { insertedIds, updatedIds };
      }
      console.error("一括 INSERT の戻り値が追加した行数より少ない", {
        expected: newOptions.length,
        actual: bulkData.length,
      });
      return addFailed();
    }
    if (bulkError?.code !== UNIQUE_VIOLATION) {
      console.error("選択肢の追加に失敗しました", bulkError);
      return addFailed();
    }

    // 23505: a same-name row exists (including deleted). Fetch the type's existing rows once and split
    // into new INSERT / reactivation / duplicate error. Filter by type_id and match names in JS: an IN
    // filter on names does not escape " or \ in PostgREST and would miss rows. Rows per type are few,
    // but page by id keyset (fetchAllPages) so max_rows cannot cut them off.
    const { data: existingRows, error: existingError } = await fetchAllPages(
      (afterId, limit) =>
        supabase
          .from("select_options")
          .select("id, value, is_active")
          .eq("type_id", typeData.id)
          .gt("id", afterId)
          .order("id", { ascending: true })
          .limit(limit)
    );
    if (existingError || !existingRows) {
      console.error("既存の選択肢の取得に失敗しました", existingError);
      return addFailed();
    }

    const existingByValue = new Map(existingRows.map((row) => [row.value, row]));
    const toInsert: SelectOptionToSave[] = [];
    const toReactivate: SelectOptionToSave[] = [];
    const seenValues = new Set<string>();
    for (const option of newOptions) {
      const existing = existingByValue.get(option.value);
      // Same name as an active row (including two added rows with the same name); return before writing anything.
      if (seenValues.has(option.value) || existing?.is_active === true) {
        return {
          insertedIds,
          updatedIds,
          error: DUPLICATE_VALUE_MESSAGE(option.value),
        };
      }
      seenValues.add(option.value);
      // Inactive (is_active not true) rows are reactivated.
      (existing ? toReactivate : toInsert).push(option);
    }

    if (toInsert.length > 0) {
      const { data: insertedRows, error: insertError } = await supabase
        .from("select_options")
        .insert(toInsert.map(toInsertRow))
        .select("id, value");
      if (insertError?.code === UNIQUE_VIOLATION) {
        // Another admin added the same name after the fetch (which name is unknown).
        console.error("選択肢の追加が他の管理者の追加と競合しました", insertError);
        return { insertedIds, updatedIds, error: CONCURRENT_INSERT_MESSAGE };
      }
      if (insertError || !insertedRows) {
        console.error("選択肢の追加に失敗しました", insertError);
        return addFailed();
      }
      recordInserted(insertedRows, toInsert);
    }

    // Reactivate deleted rows (order = added row's position). Independent per row, so parallel; wait for
    // all and return the reactivated ones even if some fail.
    const reactivateResults = await Promise.all(
      toReactivate.map(async (option) => {
        const { data, error } = await supabase
          .from("select_options")
          .update({
            display_order: option.display_order || fallbackOrder,
            is_active: true,
            updated_at: new Date().toISOString(),
          })
          .eq("type_id", typeData.id)
          .eq("value", option.value)
          .not("is_active", "is", true)
          .select("id");
        return { option, data, error };
      })
    );
    let reactivateError: string | undefined;
    for (const { option, data, error } of reactivateResults) {
      if (error) {
        console.error("削除済みの選択肢の再有効化に失敗しました", error);
        reactivateError ??= "項目の追加に失敗しました。";
      } else if (!data || data.length !== 1) {
        // Another admin activated it after the fetch (now an active same name).
        reactivateError ??= DUPLICATE_VALUE_MESSAGE(option.value);
      } else {
        insertedIds.push({ tempId: option.id, id: data[0].id });
      }
    }
    if (reactivateError) {
      return { insertedIds, updatedIds, error: reactivateError };
    }
  }

  return { insertedIds, updatedIds };
};
