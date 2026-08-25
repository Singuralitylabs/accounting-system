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
