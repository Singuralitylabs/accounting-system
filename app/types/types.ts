import { Database } from "../lib/database.types";

export type PageTitleProps = {
  title: string;
};

type MattersTable = Database["public"]["Tables"]["matters"];
export type MatterType = MattersTable["Row"];

type CostsTable = Database["public"]["Tables"]["costs"];
export type CostType = CostsTable["Row"];

type ProfilesTable = Database["public"]["Tables"]["profiles"];
export type ProfilesType = ProfilesTable["Row"];

type BusinessTable = Database["public"]["Tables"]["business"];
export type BusinessType = BusinessTable["Row"];

type SelectOptionTable = Database["public"]["Tables"]["select_options"];
export type SelectOptionType = SelectOptionTable["Row"];

export type SlackNotificationResponse = {
  success?: boolean;
  error?: string;
};

export type SlackNotificationMetadata = {
  matterId?: number;
  matterTitle?: string;
  sender?: string;
};

export type MatterInfoWithUserNameType = {
  user_name: string | null;
  slack_id: string | null;
} & MatterType;

export type CostInCardType = {
  isNew?: boolean;
  isRemoved?: boolean;
} & CostType;

export type BusinessInCardType = {
  isNew?: boolean;
  isRemoved?: boolean;
} & BusinessType;

export interface SelectOptions {
  teamList: string[];
  categoryList: string[];
  itemList: string[];
  certificateList: string[];
}

// ===== 損益計算書（P&L）関連 =====

type RecurringCostsTable = Database["public"]["Tables"]["recurring_costs"];
export type RecurringCostType = RecurringCostsTable["Row"];

export type RecurringCostInListType = {
  isNew?: boolean;
  isRemoved?: boolean;
} & RecurringCostType;

type ExtraEntriesTable = Database["public"]["Tables"]["extra_entries"];
export type ExtraEntryType = ExtraEntriesTable["Row"];

export type ExtraEntryInListType = {
  isNew?: boolean;
  isRemoved?: boolean;
} & ExtraEntryType;

// 分類別売上内訳（matters.category ごと）
export type CategoryBreakdown = { category: string; amount: number };

// 案件別費用明細（「案件を表示」ボタン用に案件 ID・案件名を保持）
export type MatterCostDetail = {
  matterId: number;
  matterTitle: string;
  amount: number;
};

// 品目別費用内訳（展開時の案件別明細＋経理追加収支の経費明細を含む）
export type ItemBreakdown = {
  item: string;
  amount: number;
  matters: MatterCostDetail[];
  extraEntries: ExtraEntryType[]; // 経理追加収支の経費（「経理追加」表示の明細行）
};

// 分類別粗利内訳（売上分類の大分類ごとに 売上 − 案件費用 を集計）
export type GrossProfitBreakdown = {
  category: string;
  revenue: number;
  cost: number;
  grossProfit: number;
};

// 費目別管理費内訳（recurring_costs.item ごと。展開時に定期費用の明細を表示）
export type RecurringCostItemBreakdown = {
  item: string;
  amount: number;
  details: RecurringCostType[];
};

// チーム別内訳（accounting / admin のみ。全体共通の管理費は team = "全体共通"）
export type TeamBreakdown = {
  team: string;
  revenue: number;
  matterCost: number;
  grossProfit: number;
  recurringCost: number;
  profit: number;
};

export type PLReportType = {
  month: string; // "YYYY-MM"
  revenueTotal: number; // 売上合計（経理追加収支の収入を含む）
  revenueByCategory: CategoryBreakdown[]; // 分類別売上内訳（経理追加収支の収入を合算）
  matterCostTotal: number; // 案件費用合計（経理追加収支の経費を含む）
  matterCostByItem: ItemBreakdown[]; // 品目別費用内訳（案件別明細＋経理追加明細を含む）
  grossProfitTotal: number; // 売上総利益（粗利）= 売上合計 − 案件費用合計
  grossProfitByCategory: GrossProfitBreakdown[]; // 分類別粗利内訳（合計は grossProfitTotal と一致）
  recurringCostTotal: number; // 管理費合計（teamleader は自チーム分のみ算入）
  recurringCostByItem: RecurringCostItemBreakdown[]; // 費目別管理費内訳（定期費用の明細を含む）
  orgWideRecurringCosts?: RecurringCostType[]; // teamleader 向け「全体共通（参考）」（損益に算入しない）
  extraEntries: ExtraEntryType[]; // 経理追加収支明細（teamleader は自チーム分のみ。損益に算入済み）
  orgWideExtraEntries?: ExtraEntryType[]; // teamleader 向け「全体共通（参考）」（損益に算入しない）
  canEditExtraEntries: boolean; // 経理追加収支を管理できるか（accounting / admin のみ true）
  ordinaryProfit: number; // 経常利益 = 粗利合計 − 管理費合計（= 売上 − 案件費用 − 管理費）
  byTeam?: TeamBreakdown[]; // チーム別内訳（accounting / admin のみ）
  undated: { revenue: number; matterCost: number }; // 月未確定（日付未入力。経理追加収支の日付未入力分を含む）
};

export type AnnualTrendType = {
  fiscalYear: number; // 年度（開始年。2026 = 2026/7〜2027/6）
  months: PLReportType[]; // 12ヶ月分（7月始まり）
};

// ===== 事前収支申告（budget_declarations）関連 =====

type BudgetDeclarationsTable =
  Database["public"]["Tables"]["budget_declarations"];
export type BudgetDeclarationType = BudgetDeclarationsTable["Row"];

type BudgetDeclarationItemsTable =
  Database["public"]["Tables"]["budget_declaration_items"];
export type BudgetDeclarationItemType = BudgetDeclarationItemsTable["Row"];

// 明細から集計した金額（合計はヘッダに非正規化していない）
export type BudgetSummaryType = {
  incomeTotal: number; // 見込み収入合計
  expenseTotal: number; // 見込み支出合計
  balance: number; // 差引 = 収入合計 − 支出合計
};

// 一覧のチーム × 申告状況 1 行
export type BudgetDeclarationStatusType = {
  team: string;
  declarationId: number | null; // 未申告なら null
  isDeclared: boolean;
  declaredByName: string | null; // 申告者名（profiles の RLS で読めない場合は null）
  comment: string | null;
  updatedAt: string | null;
  summary: BudgetSummaryType;
};

// 一覧ビューが必要とするデータ一式
export type BudgetDeclarationListType = {
  targetMonth: string; // "YYYY-MM"
  rows: BudgetDeclarationStatusType[];
};

// 申告の詳細（ヘッダ＋明細）
export type BudgetDeclarationDetailType = {
  declaration: BudgetDeclarationType;
  declaredByName: string | null;
  items: BudgetDeclarationItemType[];
  summary: BudgetSummaryType;
};
