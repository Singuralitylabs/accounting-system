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

export const MATTER_LIST_FILTER_LABELS: Record<MatterListFilterKey, string> = {
  id: "ID",
  title: "案件名",
  user_name: "担当者",
  team: "チーム",
  category: "分類",
  total_amount: "合計請求額",
  business_count: "取引先数",
  total_cost: "合計コスト",
  cost_count: "コスト数",
  unchecked_cost_count: "未払いコスト数",
};

export const MATTER_LIST_FILTER_COLUMNS = MATTER_LIST_FILTER_KEYS.map(
  (key) => ({
    key,
    label: MATTER_LIST_FILTER_LABELS[key],
  }),
);

export type ActiveMatterFilterChip = {
  key: MatterListFilterKey;
  label: string;
  values: string[];
};

export const getActiveMatterFilterChips = (
  filters: Record<string, Set<string>>,
): ActiveMatterFilterChip[] =>
  MATTER_LIST_FILTER_KEYS.flatMap((key) => {
    const values = filters[key];
    if (!values || values.size === 0) return [];
    return [
      {
        key,
        label: MATTER_LIST_FILTER_LABELS[key],
        values: Array.from(values).sort(),
      },
    ];
  });
