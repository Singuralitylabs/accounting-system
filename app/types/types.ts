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
export type ExtraEntryInsertType = ExtraEntriesTable["Insert"];

export type ExtraEntryInListType = {
  isNew?: boolean;
  isRemoved?: boolean;
} & ExtraEntryType;

// ===== 損益調整（profit_loss_adjustments）関連 =====
// 案件（business / costs）・定期費用マスタ（recurring_costs）の元データは変えず、
// 対象月ごとの実績額修正を別テーブルで管理する（Issue #108）。
// 損益計算書は「元データ + adjustment_amount = 実績」として表示・集計する。

type ProfitLossAdjustmentsTable =
  Database["public"]["Tables"]["profit_loss_adjustments"];
export type ProfitLossAdjustmentType = ProfitLossAdjustmentsTable["Row"];
export type ProfitLossAdjustmentInsertType =
  ProfitLossAdjustmentsTable["Insert"];

// 調整対象の種別（profit_loss_adjustments の business_id / cost_id / recurring_cost_id
// のうちどちらが NOT NULL かに対応する）
export type AdjustmentTargetType = "business" | "cost" | "recurring_cost";

// 実績額修正の入力・保存に使う対象の指定（3種のうちちょうど1つの id を持つ）
export type AdjustmentTarget =
  | { targetType: "business"; businessId: number }
  | { targetType: "cost"; costId: number }
  | { targetType: "recurring_cost"; recurringCostId: number };

// 明細行に共通の「元データ / 調整 / 実績」の3値。sourceChanged は調整保存後に
// 元データが変わったか（source_amount_snapshot との比較）を表す
export type AdjustableAmount = {
  sourceAmount: number; // 元データの現在の金額（business.amount / costs.price / recurring_costs.price）
  adjustmentAmount: number; // 調整の差分（調整が無ければ 0）
  actualAmount: number; // 実績額 = sourceAmount + adjustmentAmount
  sourceChanged: boolean; // 調整保存後に元データが変更されたか（画面に警告を出す）
  adjustment: ProfitLossAdjustmentType | null; // 調整レコード（無ければ null）
};

// 対象月に存在するが、対応する調整が「対象行が当月に存在しない」状態（案件の日付
// 変更等で対象行が別の月に移動した）になっている調整。削除を促す表示に使う
export type OrphanedAdjustmentType = {
  adjustment: ProfitLossAdjustmentType;
  targetType: AdjustmentTargetType;
  label: string; // 対象行を識別する表示名（案件名 - 取引先/支払先名、または定期費用名）
};

// 分類別売上内訳（matters.category ごと。案件別（business 行別）の実績額修正対象の明細＋
// 経理追加収支の収入明細を含む。合計 amount は businesses と extraEntries の両方を含む）
export type CategoryBreakdown = {
  category: string;
  amount: number;
  businesses: BusinessDetail[];
  extraEntries: ExtraEntryType[]; // 経理追加収支の収入（「経理追加」表示の明細行）
};

// 案件の売上明細（1 business 行 = 1 行。実績額修正の対象単位）
export type BusinessDetail = AdjustableAmount & {
  businessId: number;
  businessName: string; // 取引先名（同一案件に複数の business 行がある場合の識別用）
  matterId: number;
  matterTitle: string;
};

// 案件費用の明細（1 costs 行 = 1 行。実績額修正の対象単位）
export type CostDetail = AdjustableAmount & {
  costId: number;
  costName: string; // 支払先名（同一案件・同一品目に複数の costs 行がある場合の識別用）
  matterId: number;
  matterTitle: string;
};

// 品目別費用内訳（展開時の案件費用明細＋経理追加収支の経費明細を含む）
export type ItemBreakdown = {
  item: string;
  amount: number;
  costs: CostDetail[];
  extraEntries: ExtraEntryType[]; // 経理追加収支の経費（「経理追加」表示の明細行）
};

// 分類別粗利内訳（売上分類の大分類ごとに 売上 − 案件費用 を集計）
export type GrossProfitBreakdown = {
  category: string;
  revenue: number;
  cost: number;
  grossProfit: number;
};

// 定期費用の明細（1 recurring_costs 行 = 1 行。実績額修正の対象単位）
export type RecurringCostDetail = AdjustableAmount & {
  recurringCost: RecurringCostType;
};

// 費目別管理費内訳（recurring_costs.item ごと。展開時に定期費用の明細を表示）
export type RecurringCostItemBreakdown = {
  item: string;
  amount: number;
  details: RecurringCostDetail[];
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
  orgWideRecurringCosts?: RecurringCostDetail[]; // teamleader 向け「全体共通（参考）」（損益に算入しない）
  extraEntries: ExtraEntryType[]; // 経理追加収支明細（teamleader は自チーム分のみ。損益に算入済み）
  orgWideExtraEntries?: ExtraEntryType[]; // teamleader 向け「全体共通（参考）」（損益に算入しない）
  ordinaryProfit: number; // 経常利益 = 粗利合計 − 管理費合計（= 売上 − 案件費用 − 管理費）
  byTeam?: TeamBreakdown[]; // チーム別内訳（accounting / admin のみ）
  undated: { revenue: number; matterCost: number }; // 月未確定（日付未入力。経理追加収支の日付未入力分を含む）
  // 対象月に調整はあるが対象行が当月に存在しない（案件の日付変更等）ため、
  // 損益に反映されず削除待ちの調整（accounting / admin のみ。includeTeamBreakdown と同じロール判定）
  orphanedAdjustments?: OrphanedAdjustmentType[];
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
  declarationId: number | null; // 未申告なら null。明細取得のキーにも使う
  isDeclared: boolean;
  declaredByName: string | null; // 申告者名（profiles の RLS で読めない場合は null）
  updatedAt: string | null;
  summary: BudgetSummaryType;
};

// 明細 1 行 + 担当者名（profiles の RLS で読めない場合は null。declaredByName と同方式）
export type BudgetDeclarationItemWithManagerName = BudgetDeclarationItemType & {
  managerName: string | null;
};

// 申告の詳細（行を開いたときに表示する明細とコメント）
export type BudgetDeclarationDetailType = {
  comment: string | null;
  items: BudgetDeclarationItemWithManagerName[];
};

// ===== Server Action の失敗種別 =====

// 権限不足（forbidden）は再試行しても回復しないため、一時的な取得失敗
// （fetchFailed）と区別する。区別しないと react-query が無意味にリトライし、
// 画面にも「時間をおいて再読み込み」という誤った案内が出る。
// duplicate は (target_month, team) の一意制約違反（既に他の誰かが申告済み）、
// validationFailed は保存前のクライアント側バリデーション不備を表す。
// partialWriteFailed は複数ステップの書き込み（ヘッダ保存→明細差し替え）の
// 途中で失敗し、直前までの変更が反映済みの可能性がある場合に限って使う
// （例: 明細の全削除は成功したが再登録が失敗した）。ヘッダ保存自体の失敗や
// 対象行が見つからない場合は何も書き込まれていないため fetchFailed のままにする。
// Server Action の戻り値に載せるため、Error インスタンスではなくプレーンな
// オブジェクトにする（React Flight は Error をシリアライズしない）。
export type AccessFailureKind =
  | "forbidden"
  | "fetchFailed"
  | "duplicate"
  | "validationFailed"
  | "partialWriteFailed";

export type AccessFailure = {
  kind: AccessFailureKind;
  message: string;
};

export type BudgetDeclarationListResult =
  | { rows: BudgetDeclarationStatusType[]; error?: undefined }
  | { rows?: undefined; error: AccessFailure };

export type BudgetDeclarationDetailResult =
  // 未申告（該当行なし）は detail: null。取得失敗・権限不足と区別する
  | { detail: BudgetDeclarationDetailType | null; error?: undefined }
  | { detail?: undefined; error: AccessFailure };

// 申告フォーム（作成・編集）の明細 1 行分の入力
export type BudgetDeclarationItemInput = {
  entry_type: string; // "income" | "expense"
  category: string;
  description: string;
  amount: number;
  manager_id: number | null; // 担当者（メンバー）。任意選択
};

// 申告の作成・編集で送信するペイロード。declarationId が null なら新規作成
export type BudgetDeclarationSaveInput = {
  declarationId: number | null;
  targetMonth: string; // "YYYY-MM"
  team: string;
  comment: string | null;
  items: BudgetDeclarationItemInput[];
};

export type BudgetDeclarationSaveResult =
  | { id: number; error?: undefined }
  | { id?: undefined; error: AccessFailure };

export type BudgetDeclarationDeleteResult = { error?: AccessFailure };

// 前月コピー用の明細（DB から取得したそのままの形。display_order 順への
// 並べ替えは取得側（getPreviousBudgetDeclarationItems）が行う。フォームの
// 新規行への変換は app/utils/budgetDeclaration.ts の previousItemsToFormRows
// が行う。フォーム入力と同じ列は BudgetDeclarationItemInput から流用し、
// 選択列と型の手動同期を減らす）
export type BudgetDeclarationPreviousItem = BudgetDeclarationItemInput &
  Pick<BudgetDeclarationItemType, "id" | "display_order">;

export type BudgetDeclarationPreviousItemsResult =
  // 前月の申告が無い場合は items: null（コピーボタンの活性判定に使う。
  // 申告はあるが明細が 0 件の場合と区別する）
  | { items: BudgetDeclarationPreviousItem[] | null; error?: undefined }
  | { items?: undefined; error: AccessFailure };

// リマインド設定（対象日）の取得・保存結果
export type BudgetDeclarationReminderSettingsResult =
  | { targetDays: number[]; error?: undefined }
  | { targetDays?: undefined; error: AccessFailure };

export type BudgetDeclarationReminderSettingsSaveResult = {
  error?: AccessFailure;
};

// ===== 事前収支申告の定期明細（budget_recurring_items）関連 =====

type BudgetRecurringItemsTable =
  Database["public"]["Tables"]["budget_recurring_items"];
export type BudgetRecurringItemType = BudgetRecurringItemsTable["Row"];

// 定期明細管理セクション（RecurringCostList と同方式のステージング編集）の行。
// isNew/isRemoved はローカル編集状態のみで保持し、保存時にサーバへは送らない
export type BudgetRecurringItemInListType = BudgetRecurringItemType & {
  isNew: boolean;
  isRemoved: boolean;
};

export type BudgetRecurringItemListResult =
  | { items: BudgetRecurringItemType[]; error?: undefined }
  | { items?: undefined; error: AccessFailure };

export type BudgetRecurringItemSaveResult = { error?: AccessFailure };

// 新規申告フォームを開いたときに初期投入する、対象月が適用期間内の定期明細。
// 前月コピー用の BudgetDeclarationPreviousItem と全く同じ形（種別・分類・内容・
// 金額・担当者 + id・display_order）のため型を再利用し、フォーム側の変換関数
// （previousItemsToFormRows）もそのまま共用する
export type ActiveBudgetRecurringItemsResult =
  // 該当が無いのは「継続中の定期明細が無い」という正常な結果のため、
  // 前月コピーの items: null（前月申告そのものが無い）とは区別して常に配列を返す
  | { items: BudgetDeclarationPreviousItem[]; error?: undefined }
  | { items?: undefined; error: AccessFailure };
