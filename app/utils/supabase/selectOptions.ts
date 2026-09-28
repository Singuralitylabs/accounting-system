"use server";

import { getActiveSelectOptionsByType } from "./selectOptionsCache";
import { createServerSupabase } from "./clients";

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

// INSERT した行の、画面上の仮 id（送られてきた id）と DB が採番した id の対応
export type InsertedSelectOptionId = { tempId: number; id: number };

export type BulkUpsertSelectOptionsResult = {
  // INSERT に成功した行の id の対応。途中で失敗した場合も、それまでに INSERT できた
  // 行を含める（画面側で DB の id に置き換え、再保存で同じ行を再び INSERT しないため）
  insertedIds: InsertedSelectOptionId[];
  // 保存に失敗した場合のメッセージ（一部だけ保存されている場合がある）
  error?: string;
};

// 管理画面の項目管理（SelectOptionList）のカード単位の保存。
// isNew の行（画面で追加した行。id は画面上の仮 id）は INSERT、それ以外は UPDATE する。
// 追加してすぐ削除した行（isNew かつ is_active = false）は DB に無いため送らない。
// INSERT は 1 行ずつ行い、仮 id と DB の id を 1 対 1 で対応付けて返す
// （一括 INSERT の戻り値の並び順は入力順と一致する保証が無く、項目名にも一意制約が
// 無いため、値で突き合わせることもできない）。画面は保存に成功した行を DB の id に
// 置き換えるので、再取得（router.refresh）が届く前に続けて保存しても再び INSERT しない
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

  const newOptions = options.filter(
    (option) => option.isNew && option.is_active
  );
  const updateOptions = options.filter((option) => !option.isNew);

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
      return { insertedIds, error: "選択肢の種類の取得に失敗しました。" };
    }

    for (const option of newOptions) {
      const { data, error } = await supabase
        .from("select_options")
        .insert({
          type_id: typeData.id,
          value: option.value,
          display_order: option.display_order || fallbackOrder,
          is_active: true,
        })
        .select("id")
        .single();

      if (error || !data) {
        console.error("選択肢の追加に失敗しました", error);
        return { insertedIds, error: "選択肢の追加に失敗しました。" };
      }
      insertedIds.push({ tempId: option.id, id: data.id });
    }
  }

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

    const errors = results
      .filter((result) => result.error)
      .map((result) => result.error);
    if (errors.length > 0) {
      console.error("選択肢の一括更新に失敗しました", errors);
      return { insertedIds, error: "選択肢の更新に失敗しました。" };
    }
  }

  return { insertedIds };
};
