import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { Database } from "../../lib/database.types";

export type ActiveSelectOptionType = {
  id: number;
  value: string;
  display_order: number | null;
  is_active: boolean | null;
};

type OptionsByTypeName = Record<string, ActiveSelectOptionType[]>;

// 選択肢マスタは変更頻度が低いため、サーバーインスタンス内で短時間キャッシュする。
// select_options / select_option_types の SELECT ポリシーは USING (true) で
// 全ユーザー共通の結果になるため、ユーザーをまたいで共有しても安全。
// 書き込み時は clearSelectOptionsCache() で即時無効化する（別インスタンスの
// キャッシュは TTL 経過で追従する）。
const CACHE_TTL_MS = 5 * 60 * 1000;

let cacheEntry: { data: OptionsByTypeName; expiresAt: number } | null = null;

export const clearSelectOptionsCache = () => {
  cacheEntry = null;
};

// 有効な選択肢を種類名ごとにまとめて取得する。
// 従来の getSelectOptions（種類ごとに「type_id 取得 → options 取得」の2クエリ）と
// 異なり、join を使った1クエリで全種類を取得してキャッシュする。
export const getActiveSelectOptionsByType = async (
  typeNames: string[]
): Promise<OptionsByTypeName> => {
  const now = Date.now();

  if (!cacheEntry || cacheEntry.expiresAt <= now) {
    const supabase = createServerComponentClient<Database>({ cookies });

    const { data, error } = await supabase
      .from("select_options")
      .select("id, value, display_order, is_active, select_option_types!inner(name)")
      .eq("is_active", true)
      .order("display_order");

    if (error || !data) {
      console.error("選択肢の一括取得に失敗しました:", error);
      // 失敗時はキャッシュせず、空の選択肢を返す
      return Object.fromEntries(typeNames.map((name) => [name, []]));
    }

    const grouped: OptionsByTypeName = {};
    for (const row of data) {
      const typeName = row.select_option_types?.name;
      if (!typeName) continue;
      const { select_option_types: _types, ...option } = row;
      (grouped[typeName] ??= []).push(option);
    }

    cacheEntry = { data: grouped, expiresAt: now + CACHE_TTL_MS };
  }

  return Object.fromEntries(
    typeNames.map((name) => [name, cacheEntry!.data[name] ?? []])
  );
};
