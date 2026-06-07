// 経理追加収支の種別定義（extra_entries.entry_type の値域）
export const ENTRY_TYPE_LABELS: Record<string, string> = {
  income: "収入",
  expense: "支出",
};

export const ENTRY_TYPE_OPTIONS = Object.entries(ENTRY_TYPE_LABELS).map(
  ([value, label]) => ({ value, label }),
);

export const formatEntryType = (entryType: string): string =>
  ENTRY_TYPE_LABELS[entryType] ?? entryType;
