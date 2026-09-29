// Single definition of the option kinds shown on /dashboard/options (display order, names, usage, grouping).
export const OPTION_CLASS_GROUPS = [
  { key: "matter", label: "案件・費用で使う項目" },
  { key: "extra", label: "追加収支で使う項目" },
] as const;

export type OptionClassGroupKey = (typeof OPTION_CLASS_GROUPS)[number]["key"];

export const OPTION_CLASSES = [
  {
    optionClass: "team",
    label: "チーム",
    description: "案件やユーザーの所属チームの選択肢です。",
    group: "matter",
  },
  {
    optionClass: "category",
    label: "分類",
    description: "案件の分類の選択肢です。",
    group: "matter",
  },
  {
    optionClass: "item",
    label: "品目",
    description: "案件の費用の品目の選択肢です。",
    group: "matter",
  },
  {
    optionClass: "extra_income_category",
    label: "収入分類",
    description: "経理追加収支（収入）の分類の選択肢です。",
    group: "extra",
  },
  {
    optionClass: "extra_expense_category",
    label: "支出分類",
    description: "経理追加収支（支出）の分類の選択肢です。",
    group: "extra",
  },
  {
    optionClass: "payment_method",
    label: "決済方法",
    description: "経理追加収支の決済方法の選択肢です。",
    group: "extra",
  },
] as const satisfies readonly {
  optionClass: string;
  label: string;
  description: string;
  group: OptionClassGroupKey;
}[];

export type OptionClass = (typeof OPTION_CLASSES)[number]["optionClass"];

export const isOptionClass = (
  value: string | null | undefined,
): value is OptionClass =>
  OPTION_CLASSES.some((option) => option.optionClass === value);

export const getOptionLabel = (optionClass: string) =>
  OPTION_CLASSES.find((option) => option.optionClass === optionClass)?.label ??
  optionClass;
