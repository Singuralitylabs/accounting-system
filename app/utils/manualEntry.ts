// 案件外収支の種別定義（manual_entries.entry_type の値域）
export const ENTRY_TYPE_LABELS: Record<string, string> = {
  revenue: "売上",
  cost: "費用",
};

export const ENTRY_TYPE_OPTIONS = Object.entries(ENTRY_TYPE_LABELS).map(
  ([value, label]) => ({ value, label }),
);

export const formatEntryType = (entryType: string): string =>
  ENTRY_TYPE_LABELS[entryType] ?? entryType;
