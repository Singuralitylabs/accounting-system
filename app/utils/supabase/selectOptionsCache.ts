import { cache } from "react";
import { createServerSupabase } from "./clients";

export type ActiveSelectOptionType = {
  id: number;
  value: string;
  display_order: number | null;
  is_active: boolean | null;
};

type OptionsByTypeName = Record<string, ActiveSelectOptionType[]>;

export type ActiveSelectOptionsResult = {
  optionsByType: OptionsByTypeName;
  // 取得失敗時に呼び出し元（DynamicDashboard のエラー表示など）が
  // 空の選択肢と区別できるよう、エラーを結果に含めて伝播する
  error: Error | null;
};

// 有効な選択肢を全種類まとめて 1 クエリで取得し、React.cache() で
// 同一リクエスト内の呼び出しをデデュープする。
// 従来の getSelectOptions（種類ごとに「type_id 取得 → options 取得」の2クエリ）
// に対し、何種類参照してもリクエストあたり 1 クエリで済む。
// NOTE: リクエストをまたぐキャッシュ（モジュールスコープの TTL 等）は、
// マルチインスタンス環境で書き込み後の無効化が他インスタンスに伝わらず
// 古い選択肢を配信しうるため使わない。
const fetchActiveSelectOptions = cache(
  async (): Promise<ActiveSelectOptionsResult> => {
    const supabase = createServerSupabase();

    const { data, error } = await supabase
      .from("select_options")
      .select(
        "id, value, display_order, is_active, select_option_types!inner(name)",
      )
      .eq("is_active", true)
      .order("display_order");

    if (error || !data) {
      console.error("選択肢の一括取得に失敗しました:", error);
      return {
        optionsByType: {},
        error: new Error(
          `選択肢の取得に失敗しました。${error ? `: ${error.message}` : ""}`,
        ),
      };
    }

    const grouped: OptionsByTypeName = {};
    for (const row of data) {
      const typeName = row.select_option_types?.name;
      if (!typeName) continue;
      const { select_option_types: _types, ...option } = row;
      (grouped[typeName] ??= []).push(option);
    }

    return { optionsByType: grouped, error: null };
  },
);

// 有効な選択肢を種類名ごとにまとめて取得する
export const getActiveSelectOptionsByType = async (
  typeNames: string[],
): Promise<ActiveSelectOptionsResult> => {
  const { optionsByType, error } = await fetchActiveSelectOptions();

  return {
    optionsByType: Object.fromEntries(
      typeNames.map((name) => [name, optionsByType[name] ?? []]),
    ),
    error,
  };
};
