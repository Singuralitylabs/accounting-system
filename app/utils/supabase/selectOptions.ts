"use server";

import { getActiveSelectOptionsByType } from "./selectOptionsCache";
import { createServerSupabase } from "./clients";
import { UNIQUE_VIOLATION } from "./errorCodes";

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
  // UPDATE に成功した既存の行の id（途中で失敗した場合に、画面側が「一部の項目は保存済み」
  // かを判断するため。変更の無い行も送られてくるので、変更した行かどうかは画面側で判断する）
  updatedIds: number[];
  // 保存に失敗した場合の、画面に表示するメッセージ（一部だけ保存されている場合がある）
  error?: string;
};

// 項目名の一意制約 UNIQUE(type_id, value) は削除済み（無効化済み）の行にもかかる
const DUPLICATE_VALUE_MESSAGE = (value: string) =>
  `「${value}」と同じ名前の項目が既にあります（削除済みの項目を含む）。名前を変えるか、既存の項目を使ってください。`;

// 管理画面の項目管理（SelectOptionList）のカード単位の保存。
// isNew の行（画面で追加した行。id は画面上の仮 id）は追加、それ以外は UPDATE する。
// 追加してすぐ削除した行（isNew かつ is_active = false）は DB に無いため送らない。
//
// 先に既存の行を UPDATE してから追加する。項目名の一意制約 UNIQUE(type_id, value) は
// 削除済みの行にもかかるため、逆順だと「既存の項目の名前を変え、同じ保存で元の名前を
// 追加する」「項目を削除し、同じ保存で同じ名前を追加する」が一意制約違反になる。
//
// 追加する名前と同じ名前の削除済みの行が既にある場合は、INSERT が一意制約違反（23505）に
// なるため、その行を再び有効にする（表示順は追加した行の位置にする）。有効な行と重なる
// 場合は分かるメッセージを返す（UPDATE で名前を削除済みの行と同じにした場合も同様）。
//
// 追加は 1 行ずつ行い、仮 id と DB の id を 1 対 1 で対応付けて返す（一括 INSERT の
// 戻り値の並び順は入力順と一致する保証が無く、行ごとに一意制約違反・再有効化を
// 判断する必要もあるため）。画面は保存に成功した行を DB の id に置き換えるので、
// 再取得（router.refresh）が届く前に続けて保存しても再び追加しない
export const bulkUpsertSelectOptions = async (
  typeName: string,
  options: Array<{
    id: number;
    value: string;
    display_order: number | null;
    is_active: boolean | null;
    isNew: boolean;
  }>
): Promise<BulkUpsertSelectOptionsResult> => {
  const supabase = createServerSupabase();
  const fallbackOrder = options.length;
  const insertedIds: InsertedSelectOptionId[] = [];
  const updatedIds: number[] = [];

  const newOptions = options.filter(
    (option) => option.isNew && option.is_active
  );
  const updateOptions = options.filter((option) => !option.isNew);

  if (updateOptions.length > 0) {
    const results = await Promise.all(
      updateOptions.map((option) =>
        supabase
          .from("select_options")
          .update({
            value: option.value,
            display_order: option.display_order || fallbackOrder,
            is_active: option.is_active!,
            updated_at: new Date().toISOString(),
          })
          .eq("id", option.id)
      )
    );

    results.forEach((result, index) => {
      if (!result.error) updatedIds.push(updateOptions[index].id);
    });
    const failedIndex = results.findIndex((result) => result.error);
    if (failedIndex >= 0) {
      const duplicateIndex = results.findIndex(
        (result) => result.error?.code === UNIQUE_VIOLATION
      );
      if (duplicateIndex >= 0) {
        return {
          insertedIds,
          updatedIds,
          error: DUPLICATE_VALUE_MESSAGE(updateOptions[duplicateIndex].value),
        };
      }
      console.error(
        "選択肢の一括更新に失敗しました",
        results.filter((result) => result.error).map((result) => result.error)
      );
      return { insertedIds, updatedIds, error: "項目の更新に失敗しました。" };
    }
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

    for (const option of newOptions) {
      const displayOrder = option.display_order || fallbackOrder;
      const { data, error } = await supabase
        .from("select_options")
        .insert({
          type_id: typeData.id,
          value: option.value,
          display_order: displayOrder,
          is_active: true,
        })
        .select("id")
        .single();

      if (data && !error) {
        insertedIds.push({ tempId: option.id, id: data.id });
        continue;
      }

      if (error?.code !== UNIQUE_VIOLATION) {
        console.error("選択肢の追加に失敗しました", error);
        return { insertedIds, updatedIds, error: "項目の追加に失敗しました。" };
      }

      // 同じ名前の行が既にある。削除済み（is_active が true 以外）なら再び有効にする
      const { data: reactivated, error: reactivateError } = await supabase
        .from("select_options")
        .update({
          display_order: displayOrder,
          is_active: true,
          updated_at: new Date().toISOString(),
        })
        .eq("type_id", typeData.id)
        .eq("value", option.value)
        .not("is_active", "is", true)
        .select("id");

      if (reactivateError) {
        console.error("削除済みの選択肢の再有効化に失敗しました", reactivateError);
        return { insertedIds, updatedIds, error: "項目の追加に失敗しました。" };
      }
      if (!reactivated || reactivated.length !== 1) {
        // 有効な行と同じ名前（同じ保存で同じ名前を 2 行追加した場合を含む）
        return {
          insertedIds,
          updatedIds,
          error: DUPLICATE_VALUE_MESSAGE(option.value),
        };
      }
      insertedIds.push({ tempId: option.id, id: reactivated[0].id });
    }
  }

  return { insertedIds, updatedIds };
};
