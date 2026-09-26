import {
  ExtraEntryInListType,
  ExtraEntryInsertType,
  ExtraEntryType,
} from "../types/types";

// 経理追加収支の種別定義（extra_entries.entry_type の値域）
const ENTRY_TYPE_LABELS: Record<string, string> = {
  income: "収入",
  expense: "支出",
};

export const formatEntryType = (entryType: string): string =>
  ENTRY_TYPE_LABELS[entryType] ?? entryType;

// 種別 Select の選択肢（income/expense）。事前収支申告の明細フォーム
// （BudgetDeclarationForm）と定期明細管理セクション（BudgetRecurringItemList）で共用する
export const ENTRY_TYPE_OPTIONS = [
  { value: "income", label: formatEntryType("income") },
  { value: "expense", label: formatEntryType("expense") },
];

// 一覧の行データを DB 書き込み用の形に変換する（INSERT / UPDATE 共通）
// 種別ごとの項目の整合性（収入=請求額あり・決済方法なし / 支出=経費・決済方法あり、
// 収入専用項目なし）はここで揃え、DB の CHECK 制約
// （extra_entries_type_fields_check）でも担保する。
// updated_at は DB トリガー（update_extra_entries_updated_at）が now() で設定する
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
    // 経費は収入時は任意（未入力 = null）、支出時は必須
    expense_amount: entry.expense_amount,
    payment_method: isIncome ? null : entry.payment_method,
  };
};

// 保存済みの行が編集されていないか（DB に書き込む項目がすべて保存済みの値と同じか）。
// 一括保存は画面の全行を送るため、未変更の行は UPDATE せず、確定済みの月の
// 編集ロック（Issue #148）の判定対象からも外す（確定済みの月の行を触っていないのに
// 他の月の行を保存できなくなることを防ぐ）
export const isExtraEntryUnchanged = (
  original: ExtraEntryType,
  entry: ExtraEntryInListType,
): boolean => {
  const next = toExtraEntryDbRow(entry);
  return (Object.keys(next) as (keyof typeof next)[]).every((key) => {
    const before = original[key];
    const after = next[key];
    // 金額は numeric のため、数値として比較する（"100.00" と 100 など）
    if (typeof before === "number" || typeof after === "number") {
      return (
        (before === null && after === null) ||
        (before !== null && after !== null && Number(before) === Number(after))
      );
    }
    return (before ?? null) === (after ?? null);
  });
};

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
