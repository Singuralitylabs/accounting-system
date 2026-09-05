import { ExtraEntryInsertType, ExtraEntryType } from "../types/types";

// 経理追加収支の種別定義（extra_entries.entry_type の値域）
const ENTRY_TYPE_LABELS: Record<string, string> = {
  income: "収入",
  expense: "支出",
};

export const formatEntryType = (entryType: string): string =>
  ENTRY_TYPE_LABELS[entryType] ?? entryType;

// ===== 前月の経理追加収支コピー（損益計算書 月次タブ「前月の経理追加収支をコピー」用） =====
// Supabase アクセス（app/utils/supabase/extraEntries.ts）から切り離しているのは、
// 副作用なしでユニットテストできるようにするため（docs/testing.md「2.6」）。

// 対象月（YYYY-MM）の日数。Date のローカルコンストラクタ/ゲッターのみで計算し、
// toISOString 等の UTC 変換を経由しないため TZ の影響を受けない
// （formatter.ts の toDateString / parseDateString と同じ方式）。
const daysInMonth = (targetMonth: string): number => {
  const year = parseInt(targetMonth.slice(0, 4), 10);
  const month = parseInt(targetMonth.slice(5, 7), 10);
  return new Date(year, month, 0).getDate();
};

// 日付文字列（YYYY-MM-DD）の日をそのまま、月だけを targetMonth（YYYY-MM）に置き換える。
// 対象月にその日が無い場合（例: 31日→2月）は対象月の末日に丸める。
export const shiftDateToMonth = (
  dateStr: string,
  targetMonth: string,
): string => {
  const day = parseInt(dateStr.slice(8, 10), 10);
  const clampedDay = Math.min(day, daysInMonth(targetMonth));
  return `${targetMonth}-${String(clampedDay).padStart(2, "0")}`;
};

// 前月の経理追加収支明細 → 当月への複製用データを組み立てる（純粋関数）。
// id・inserted_at・updated_at は複製しない（新規行として INSERT するため）。
// invoice_number は当月の請求書番号が別物のため常に空にする。entry_date が
// NULL（月未確定）の明細は対象外にする（取得側のクエリで既に除外される想定だが、
// ここでも防御的に除外する）。
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

// 二重コピー防止用の重複判定キー。entry_date は対象月内で共通のため含めず、
// invoice_number（当月は常に空にする）・billing_target（自由入力の補足情報）も
// 対象外にする（entry_type・分類・内容・責任者・チーム・金額が一致すれば
// 同一明細の再コピーとみなす）。
// team・billing_amount・expense_amount は ExtraEntryInsertType（INSERT 用の行。
// これらは省略可能）・ExtraEntryType（DB の Row。常に存在）のどちらからも
// 呼べるよう任意項目にする
type ExtraEntryDuplicateFields = {
  entry_type: string;
  category: string;
  description: string;
  manager_id: number;
  team?: string | null;
  billing_amount?: number | null;
  expense_amount?: number | null;
};

export const extraEntryDuplicateKey = (
  entry: ExtraEntryDuplicateFields,
): string =>
  JSON.stringify([
    entry.entry_type,
    entry.category,
    entry.description,
    entry.manager_id,
    entry.team ?? null,
    entry.billing_amount ?? null,
    entry.expense_amount ?? null,
  ]);

// 複製予定の行から、当月に既に同一内容の明細がある行を取り除く（純粋関数）。
// 確認ダイアログを見逃して連続でボタンを押した場合などに、同じ明細が
// 何重にも登録されるのを防ぐ。
export const excludeDuplicateExtraEntries = (
  rows: readonly ExtraEntryInsertType[],
  existingEntries: readonly ExtraEntryType[],
): ExtraEntryInsertType[] => {
  const existingKeys = new Set(
    existingEntries.map((entry) => extraEntryDuplicateKey(entry)),
  );
  return rows.filter((row) => !existingKeys.has(extraEntryDuplicateKey(row)));
};
