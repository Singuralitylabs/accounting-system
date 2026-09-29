"use server";

import { getActiveSelectOptionsByType } from "./selectOptionsCache";
import { createServerSupabase } from "./clients";
import { UNIQUE_VIOLATION } from "./errorCodes";
import { fetchAllPages } from "./paging";

// 有効な選択肢の取得。実装は getActiveSelectOptionsByType（join による1クエリ＋
// リクエスト内キャッシュ）に一本化しており、これはその種類別ラッパー。
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

// INSERT した行の、画面上の仮 id（送られてきた id）と DB の id の対応。
// 同じ名前の削除済み（無効化済み）の行を再び有効にした場合は、その既存の行の id になる
export type InsertedSelectOptionId = { tempId: number; id: number };

export type BulkUpsertSelectOptionsResult = {
  // 追加（INSERT または削除済みの行の再有効化）に成功した行の id の対応。途中で失敗した
  // 場合も、それまでに追加できた行を含める（画面側で DB の id に置き換え、再保存で同じ行を
  // 再び追加しないため）
  insertedIds: InsertedSelectOptionId[];
  // UPDATE で実際に更新できた（1 行更新された）既存の行の id。途中で失敗した場合に、
  // 画面側が保存できた行を保存済みの状態（baseline）に取り込み、「一部の項目は保存済み」
  // かを判断するため
  updatedIds: number[];
  // 保存に失敗した場合の、画面に表示するメッセージ（一部だけ保存されている場合がある）
  error?: string;
};

// 保存する行。画面（SelectOptionList）は変更した既存の行と追加した行だけを送る
export type SelectOptionToSave = {
  id: number;
  value: string;
  display_order: number | null;
  is_active: boolean | null;
  isNew: boolean;
  // 既存の行の項目名を変えたか。false の行（表示順・有効 / 無効だけを変えた行）は並行に
  // UPDATE し、それ以外（省略時を含む）は 1 行ずつ順番に UPDATE する
  valueChanged?: boolean;
};

// 項目名の一意制約 UNIQUE(type_id, value) は削除済み（無効化済み）の行にもかかる
const DUPLICATE_VALUE_MESSAGE = (value: string) =>
  `「${value}」と同じ名前の項目が既にあります（削除済みの項目を含む）。名前を変えるか、既存の項目を使ってください。`;

// 追加の途中で、他の管理者が同じ名前の項目を同時に追加した場合
const CONCURRENT_INSERT_MESSAGE =
  "同じ名前の項目が同時に追加された可能性があります。画面を再読み込みして、もう一度保存してください。";

// UPDATE で更新できた行が 0 行だった場合（RLS で弾かれた、他の管理者が行を削除した等）
const NOT_UPDATED_MESSAGE =
  "更新できなかった項目があります（削除されたか、更新する権限がありません）。画面を再読み込みしてください。";

const UPDATE_FAILED_MESSAGE = "項目の更新に失敗しました。";

// 管理画面の項目管理（SelectOptionList）のカード単位の保存。
// isNew の行（画面で追加した行。id は画面上の仮 id）は追加、それ以外は UPDATE する。
// 追加してすぐ削除した行（isNew かつ is_active = false）は DB に無いため送らない。
// 画面は変更した既存の行と追加した行だけを送る（変更していない行は UPDATE しない）。
//
// 先に既存の行を UPDATE してから追加する。項目名の一意制約 UNIQUE(type_id, value) は
// 削除済みの行にもかかるため、逆順だと「既存の項目の名前を変え、同じ保存で元の名前を
// 追加する」「項目を削除し、同じ保存で同じ名前を追加する」が一意制約違反になる。
//
// 追加する名前と同じ名前の削除済みの行が既にある場合は、INSERT が一意制約違反（23505）に
// なるため、その行を再び有効にする（表示順は追加した行の位置にする）。有効な行と重なる
// 場合は分かるメッセージを返す（UPDATE で名前を削除済みの行と同じにした場合・名前を
// 入れ替えた場合も同様）。
//
// 追加はまず 1 回の INSERT ... RETURNING でまとめて行う（20 行追加しても 1 往復）。
// 一意制約違反（23505）で失敗した場合（一括 INSERT は全体が失敗し、何も追加されない）だけ、
// この種類の既存の行を 1 回取得し、新規の行の INSERT（まとめて）と削除済みの行の
// 再有効化（並行）に振り分ける。仮 id と DB の id は項目名（value）をキーに 1 対 1 で
// 対応付けて返す（一括 INSERT の戻り値の並び順は入力順と一致する保証が無いため）。
// 画面は保存に成功した行を DB の id に置き換えるので、再取得（router.refresh）が届く前に
// 続けて保存しても再び追加しない
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

  // 既存の行を 1 行 UPDATE する。一意制約違反（23505）は後回しにする（deferred）
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

  // 項目名を変えていない行（表示順・有効 / 無効だけを変えた行）は、互いに順序の制約が
  // 無いため並行に UPDATE する（項目名は同じ値のまま送るため一意制約違反にならないが、
  // なった場合は名前を変えた行と同じく後回しにして 1 行ずつ再び試す）。
  // 失敗した行があれば、他の行の結果を待ってから（更新できた行を updatedIds に含めて）
  // エラーを返し、名前の変更・追加へ進まない
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

  // 項目名を変えた行は 1 行ずつ順番に UPDATE する（並行に送ると、連鎖した名前の変更
  // 「P→Q と Q→R」が実行順次第で一意制約違反になるため）。一意制約違反（23505）に
  // なった行は後回しにし、他の行の UPDATE が進んだら再び試す（Q→R が先に済めば P→Q も
  // 通る）。1 周で 1 行も進まなければ、名前が削除済みの行と重なっているか、名前を
  // 入れ替えようとしている（同じ保存では入れ替えられない）ため、分かるメッセージを返す。
  // 23505 以外の失敗・更新できた行が 0 行の場合（RLS で弾かれた、他の管理者が行を
  // 削除した等）はその時点で止め、ログに残してエラーを返す
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
    // 一括 INSERT した行の（value をキーにした）id を、追加した順に insertedIds へ入れる。
    // 一括 INSERT が成功したときは項目名がすべて異なる（一意制約）ため value で 1 対 1 に対応する
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

    // まず 1 回の INSERT でまとめて追加する（1 往復）。一括 INSERT は全体が成功するか、
    // 全体が失敗する（一部だけ追加されることはない）
    const { data: bulkData, error: bulkError } = await supabase
      .from("select_options")
      .insert(newOptions.map(toInsertRow))
      .select("id, value");

    if (!bulkError && bulkData) {
      // INSERT は成功している。返ってきた行は必ず insertedIds に入れる（入れないと画面が
      // 仮 id のままになり、再保存で同じ名前を再び追加して重複エラーになる）
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

    // 一意制約違反（23505）: 同じ名前の行が既にある（削除済みの行を含む）。この種類の既存の
    // 行を 1 回で取得し、新規 INSERT・削除済みの行の再有効化・重複エラーに振り分ける。
    // 項目名で絞る（IN (...)）と、項目名に含まれる " や \ が PostgREST のフィルタで
    // エスケープされず取りこぼすため、種類（type_id）で絞って項目名は JS 側で照合する。
    // 種類ごとの件数は少ないが、max_rows で打ち切られて取りこぼさないよう id のキーセット方式で
    // ページングする（fetchAllPages）
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
      // 有効な行と同じ名前（同じ保存で同じ名前を 2 行追加した場合を含む）。何も書き込む前に
      // 返すため、一部だけ追加されることはない
      if (seenValues.has(option.value) || existing?.is_active === true) {
        return {
          insertedIds,
          updatedIds,
          error: DUPLICATE_VALUE_MESSAGE(option.value),
        };
      }
      seenValues.add(option.value);
      // 削除済み（is_active が true 以外）の行は再び有効にする
      (existing ? toReactivate : toInsert).push(option);
    }

    if (toInsert.length > 0) {
      const { data: insertedRows, error: insertError } = await supabase
        .from("select_options")
        .insert(toInsert.map(toInsertRow))
        .select("id, value");
      if (insertError?.code === UNIQUE_VIOLATION) {
        // 既存の行の取得後に、他の管理者が同じ名前の項目を追加した（どの名前かは分からない）
        console.error("選択肢の追加が他の管理者の追加と競合しました", insertError);
        return { insertedIds, updatedIds, error: CONCURRENT_INSERT_MESSAGE };
      }
      if (insertError || !insertedRows) {
        console.error("選択肢の追加に失敗しました", insertError);
        return addFailed();
      }
      recordInserted(insertedRows, toInsert);
    }

    // 削除済みの行の再有効化（表示順は追加した行の位置にする）。行ごとに独立しているため
    // 並行に行い、失敗した行があっても他の行の結果を待ってから、再有効化できた行を返す
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
        // 取得後に他の管理者が有効にした（有効な行と同じ名前になった）
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
