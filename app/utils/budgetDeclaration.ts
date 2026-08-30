// 事前収支申告の集計・対象月ロジック（純粋関数）。
// Supabase アクセス（"use server" が付く app/utils/supabase/budgetDeclarations.ts）から
// 切り離しているのは、副作用なしでユニットテストできるようにするため
// （docs/testing.md「2.6 テスト容易化リファクタリング方針」）。

import { BudgetDeclarationStatusType, BudgetSummaryType } from "../types/types";
import { ROUTE_PERMISSIONS, hasClassAccess } from "./permissions";

// 事前収支申告を閲覧できるロール（/budget-declarations のルート保護と常に一致する）
export const BUDGET_DECLARATION_ALLOWED_CLASSES =
  ROUTE_PERMISSIONS["/budget-declarations"];

// 明細の種別（budget_declaration_items.entry_type の CHECK 制約と同じ値域）
export type BudgetEntryType = "income" | "expense";

export const BUDGET_ENTRY_TYPE_LABELS: Record<BudgetEntryType, string> = {
  income: "収入",
  expense: "支出",
};

// 集計に必要な明細の最小形（DB 行・フォームの入力行のどちらからでも渡せる）
export type BudgetItemAmount = {
  entry_type: string;
  amount: number;
};

// 月キー（YYYY-MM）→ DB 格納用の月初日（YYYY-MM-01）。
// budget_declarations.target_month は月初日で格納する CHECK 制約付きのため、
// 書き込み・絞り込みの双方でこの形に正規化する。
export const toTargetMonthDate = (month: string): string =>
  `${month.slice(0, 7)}-01`;

// DB の date 文字列（YYYY-MM-DD）→ 月キー（YYYY-MM）。
// タイムゾーン変換による月ズレを避けるため Date オブジェクトは使わない。
export const toTargetMonthKey = (targetMonth: string): string =>
  targetMonth.slice(0, 7);

// 月キー（YYYY-MM）に月数を加算する。Date を経由しないため DST・UTC ズレの影響を受けない。
export const addMonths = (month: string, count: number): string => {
  const year = parseInt(month.slice(0, 4), 10);
  const monthNumber = parseInt(month.slice(5, 7), 10);
  // 0 始まりに直してから加算し、年繰り上がり・繰り下がりを剰余で処理する
  const zeroBased = year * 12 + (monthNumber - 1) + count;
  const nextYear = Math.floor(zeroBased / 12);
  const nextMonthNumber = zeroBased - nextYear * 12 + 1;
  return `${String(nextYear).padStart(4, "0")}-${String(nextMonthNumber).padStart(2, "0")}`;
};

// JST 基準の当月キー（YYYY-MM）。サーバ（UTC）とブラウザ（JST）で結果を揃えるため、
// ローカルタイムゾーンに依存せず UTC からの +9 時間で判定する。
export const toJstMonthKey = (now: Date = new Date()): string =>
  new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 7);

// 一覧の初期表示に使う対象月 = JST の翌月。
// 「毎月20日までに翌月分を申告する」運用に合わせる（docs/specification.md 4.20）。
export const defaultTargetMonth = (now: Date = new Date()): string =>
  addMonths(toJstMonthKey(now), 1);

// 明細から収入合計・支出合計・差引を求める。
// 合計はヘッダに非正規化していないため、表示のたびにここで集計する
// （docs/database.md 3.9）。
export const summarizeBudgetItems = (
  items: readonly BudgetItemAmount[],
): BudgetSummaryType => {
  let incomeTotal = 0;
  let expenseTotal = 0;

  for (const item of items) {
    // amount は DB の CHECK（> 0）で正の値のみ。符号は entry_type が決める
    if (item.entry_type === "income") {
      incomeTotal += item.amount;
    } else if (item.entry_type === "expense") {
      expenseTotal += item.amount;
    }
  }

  return {
    incomeTotal,
    expenseTotal,
    balance: incomeTotal - expenseTotal,
  };
};

// 一覧に表示するチームを決める。
// 行そのものの可視範囲は RLS が担保するが、「未申告」を表示するには
// 申告が無いチームも並べる必要があるため、チームマスタ側もロールで絞る。
export const visibleBudgetTeams = (
  profileClass: string | null | undefined,
  profileTeam: string | null | undefined,
  teamList: readonly string[],
): string[] => {
  if (hasClassAccess(["accounting", "admin"], profileClass)) {
    return [...teamList];
  }
  if (profileClass === "teamleader" && profileTeam) {
    return [profileTeam];
  }
  // それ以外（public / チーム未設定のチームリーダー）は表示対象なし
  return [];
};

// 集計前の申告（ヘッダ＋明細）。DB から取得した形に対応する
export type BudgetDeclarationWithItems = {
  id: number;
  team: string;
  comment: string | null;
  updated_at: string | null;
  declared_by_name: string | null;
  items: BudgetItemAmount[];
};

// チーム一覧と申告を突き合わせ、チーム × 申告状況の行を組み立てる。
// マスタから外れた（無効化・改名された）チームの申告を取りこぼさないよう、
// チームマスタに無いチームの申告も末尾に残す。
export const buildBudgetDeclarationStatusList = (
  teams: readonly string[],
  declarations: readonly BudgetDeclarationWithItems[],
): BudgetDeclarationStatusType[] => {
  const declarationByTeam = new Map(
    declarations.map((declaration) => [declaration.team, declaration]),
  );

  const toStatus = (
    team: string,
    declaration: BudgetDeclarationWithItems | undefined,
  ): BudgetDeclarationStatusType => ({
    team,
    declarationId: declaration?.id ?? null,
    isDeclared: !!declaration,
    declaredByName: declaration?.declared_by_name ?? null,
    comment: declaration?.comment ?? null,
    updatedAt: declaration?.updated_at ?? null,
    summary: summarizeBudgetItems(declaration?.items ?? []),
  });

  const rows = teams.map((team) => toStatus(team, declarationByTeam.get(team)));

  const knownTeams = new Set(teams);
  const orphanRows = declarations
    .filter((declaration) => !knownTeams.has(declaration.team))
    .map((declaration) => toStatus(declaration.team, declaration));

  return [...rows, ...orphanRows];
};

// 一覧全体の合計（表示中のチーム分のみ）
export const totalBudgetSummary = (
  rows: readonly BudgetDeclarationStatusType[],
): BudgetSummaryType =>
  rows.reduce<BudgetSummaryType>(
    (total, row) => ({
      incomeTotal: total.incomeTotal + row.summary.incomeTotal,
      expenseTotal: total.expenseTotal + row.summary.expenseTotal,
      balance: total.balance + row.summary.balance,
    }),
    { incomeTotal: 0, expenseTotal: 0, balance: 0 },
  );
