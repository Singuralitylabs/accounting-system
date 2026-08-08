// 経理追加収支の種別定義（extra_entries.entry_type の値域）
const ENTRY_TYPE_LABELS: Record<string, string> = {
  income: "収入",
  expense: "支出",
};

export const formatEntryType = (entryType: string): string =>
  ENTRY_TYPE_LABELS[entryType] ?? entryType;
