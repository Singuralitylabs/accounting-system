export const MATTER_LIST_FILTER_KEYS = [
  "id",
  "title",
  "user_name",
  "team",
  "category",
  "total_amount",
  "business_count",
  "total_cost",
  "cost_count",
  "unchecked_cost_count",
] as const;

export type MatterListFilterKey = (typeof MATTER_LIST_FILTER_KEYS)[number];

export type MatterListFilters = Partial<Record<MatterListFilterKey, string[]>>;

export const NUMERIC_MATTER_FILTER_KEYS = [
  "id",
  "total_amount",
  "business_count",
  "total_cost",
  "cost_count",
  "unchecked_cost_count",
] as const satisfies readonly MatterListFilterKey[];

const NUMERIC_MATTER_FILTER_KEY_SET = new Set<string>(
  NUMERIC_MATTER_FILTER_KEYS,
);

export const isNumericMatterFilterKey = (key: string) =>
  NUMERIC_MATTER_FILTER_KEY_SET.has(key);

export const compactMatterListFilters = (
  filters: Record<string, Set<string>>,
): MatterListFilters => {
  const compacted: MatterListFilters = {};
  for (const key of MATTER_LIST_FILTER_KEYS) {
    const values = filters[key];
    if (values && values.size > 0) {
      compacted[key] = Array.from(values).sort();
    }
  }
  return compacted;
};

export const hasMatterListFilters = (filters: MatterListFilters) =>
  MATTER_LIST_FILTER_KEYS.some((key) => (filters[key]?.length ?? 0) > 0);
