import {
  ExtraEntryInListType,
  ExtraEntryInsertType,
  ExtraEntryType,
} from "../types/types";
import { currentJstMonth, isMonthKey } from "./formatter";

const ENTRY_TYPE_LABELS: Record<string, string> = {
  income: "収入",
  expense: "支出",
};

export const formatEntryType = (entryType: string): string =>
  ENTRY_TYPE_LABELS[entryType] ?? entryType;

export const isIncomeExtraEntry = (entry: { entryType: string }): boolean =>
  entry.entryType === "income";

// Shared by BudgetDeclarationForm and BudgetRecurringItemList.
export const ENTRY_TYPE_OPTIONS = [
  { value: "income", label: formatEntryType("income") },
  { value: "expense", label: formatEntryType("expense") },
];

// Shared by INSERT / UPDATE. Per-type field consistency (income: billed amount, no payment method;
// expense: expense and payment method, no income-only fields) is aligned here and enforced by the
// DB CHECK extra_entries_type_fields_check. updated_at is set by a DB trigger.
export const toExtraEntryDbRow = (entry: ExtraEntryInListType) => {
  const isIncome = entry.entry_type === "income";
  return {
    entry_type: entry.entry_type,
    category: entry.category,
    entry_date: entry.entry_date,
    invoice_number: isIncome ? entry.invoice_number : null,
    description: entry.description,
    billing_target: isIncome ? entry.billing_target : null,
    manager_id: entry.manager_id,
    team: entry.team,
    billing_amount: isIncome ? entry.billing_amount : null,
    // Expense is optional for income, required for expense.
    expense_amount: entry.expense_amount,
    payment_method: isIncome ? null : entry.payment_method,
  };
};

// Compared fields derive from toExtraEntryDbRow, so new columns are not missed.
export const isExtraEntryUnchanged = (
  original: ExtraEntryType,
  entry: ExtraEntryInListType,
): boolean => {
  const next = toExtraEntryDbRow(entry);
  return (Object.keys(next) as (keyof typeof next)[]).every((key) => {
    const before = original[key];
    const after = next[key];
    // numeric: compare as numbers ("100.00" vs 100).
    if (typeof before === "number" || typeof after === "number") {
      return (
        (before === null && after === null) ||
        (before !== null && after !== null && Number(before) === Number(after))
      );
    }
    return (before ?? null) === (after ?? null);
  });
};

// `?month=YYYY-MM` if valid, otherwise the current month (JST).
export const resolveExtraEntryMonth = (
  monthParam: string | null | undefined,
  now: Date = new Date(),
): string =>
  monthParam && isMonthKey(monthParam) ? monthParam : currentJstMonth(now);

// baseline = saved rows as loaded. Unedited rows are not sent so another user's later save is not
// overwritten with stale values (and untouched closed-month rows stay out of the edit-lock check).
export const selectChangedExtraEntries = (
  rows: ExtraEntryInListType[],
  baseline: ReadonlyMap<number, ExtraEntryType>,
): ExtraEntryInListType[] =>
  rows.filter((row) => {
    if (row.isNew) return !row.isRemoved;
    if (row.isRemoved) return true;
    const base = baseline.get(row.id);
    return !base || !isExtraEntryUnchanged(base, row);
  });

// ===== Copy previous month's extra entries (profit and loss monthly tab) =====

// Uses only local Date constructor/getters (no UTC conversion), so it is TZ-independent.
const daysInMonth = (targetMonth: string): number => {
  const year = parseInt(targetMonth.slice(0, 4), 10);
  const month = parseInt(targetMonth.slice(5, 7), 10);
  return new Date(year, month, 0).getDate();
};

// Keeps the day, swaps the month; rounds to the last day when it does not exist (e.g. 31 -> Feb).
export const shiftDateToMonth = (
  dateStr: string,
  targetMonth: string,
): string => {
  const day = parseInt(dateStr.slice(8, 10), 10);
  const clampedDay = Math.min(day, daysInMonth(targetMonth));
  return `${targetMonth}-${String(clampedDay).padStart(2, "0")}`;
};

// Not copied: id, timestamps. invoice_number is always cleared (differs per month). Entries with NULL
// entry_date are excluded (the query already does; defensive here).
export const buildCopiedExtraEntries = (
  previousEntries: readonly ExtraEntryType[],
  targetMonth: string,
): ExtraEntryInsertType[] =>
  previousEntries
    .filter((entry) => entry.entry_date !== null)
    .map((entry) => ({
      entry_type: entry.entry_type,
      category: entry.category,
      entry_date: shiftDateToMonth(entry.entry_date as string, targetMonth),
      invoice_number: null,
      description: entry.description,
      billing_target: entry.billing_target,
      manager_id: entry.manager_id,
      team: entry.team,
      billing_amount: entry.billing_amount,
      expense_amount: entry.expense_amount,
      payment_method: entry.payment_method,
    }));
