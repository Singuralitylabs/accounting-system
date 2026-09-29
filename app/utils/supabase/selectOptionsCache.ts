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
  // Error is propagated so callers can tell a failure from empty options.
  error: Error | null;
};

// Fetches all active option types in one query, deduped per request with React.cache().
// NOTE: no cross-request cache (module-scope TTL etc.): with multiple instances, invalidation
// after a write would not reach others and stale options could be served.
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
