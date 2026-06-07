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

// チーム別内訳（accounting / admin のみ。全体共通の管理費は team = "全体共通"）
export type TeamBreakdown = {
  team: string;
  revenue: number;
  matterCost: number;
  recurringCost: number;
  profit: number;
};

export type PLReportType = {
  month: string; // "YYYY-MM"
  revenueTotal: number; // 売上合計（経理追加収支の収入を含む）
  revenueByCategory: CategoryBreakdown[]; // 分類別売上内訳（経理追加収支の収入を合算）
  matterCostTotal: number; // 案件費用合計（経理追加収支の経費を含む）
  matterCostByItem: ItemBreakdown[]; // 品目別費用内訳（案件別明細＋経理追加明細を含む）
  recurringCostTotal: number; // 管理費合計（teamleader は自チーム分のみ算入）
  recurringCostDetails: RecurringCostType[]; // 管理費明細
  orgWideRecurringCosts?: RecurringCostType[]; // teamleader 向け「全体共通（参考）」（損益に算入しない）
  extraEntries: ExtraEntryType[]; // 経理追加収支明細（teamleader は自チーム分のみ。損益に算入済み）
  orgWideExtraEntries?: ExtraEntryType[]; // teamleader 向け「全体共通（参考）」（損益に算入しない）
  canEditExtraEntries: boolean; // 経理追加収支を管理できるか（accounting / admin のみ true）
  operatingProfit: number; // 営業損益 = 売上 − 案件費用 − 管理費
  byTeam?: TeamBreakdown[]; // チーム別内訳（accounting / admin のみ）
  undated: { revenue: number; matterCost: number }; // 月未確定（日付未入力。経理追加収支の日付未入力分を含む）
};

export type AnnualTrendType = {
  fiscalYear: number; // 年度（開始年。2026 = 2026/7〜2027/6）
  months: PLReportType[]; // 12ヶ月分（7月始まり）
};
