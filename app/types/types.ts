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
  adjustment: ProfitLossAdjustmentType | null; // 調整レコード（無ければ null。確定スナップショットでは常に null）
  adjustmentReason: string | null; // 調整理由（調整が無ければ null。確定スナップショットにも保持する）
};

// 対象月に存在するが、対応する調整が「対象行が当月に存在しない」状態（案件開始日の
// 変更等で対象行が別の月に移動した）になっている調整。削除を促す表示に使う
export type OrphanedAdjustmentType = {
  adjustment: ProfitLossAdjustmentType;
  targetType: AdjustmentTargetType;
  label: string; // 対象行を識別する表示名（案件名 - 取引先/コスト名、または定期費用名）
};

// ===== 損益計算書の表示タイトル（profit_loss_labels）関連 =====
// 案件名・取引先名・コスト名・定期費用名の元データは変えず、損益計算書上だけで
// 有効な表示タイトルを別テーブルで管理する（Issue #150。全月共通）。

type ProfitLossLabelsTable = Database["public"]["Tables"]["profit_loss_labels"];
export type ProfitLossLabelType = ProfitLossLabelsTable["Row"];

// タイトル変更の対象（matter_id / business_id / cost_id / recurring_cost_id のうち
// ちょうど1つ）
export type LabelTarget =
  | { targetType: "matter"; matterId: number }
  | { targetType: "business"; businessId: number }
  | { targetType: "cost"; costId: number }
  | { targetType: "recurring_cost"; recurringCostId: number };

// 損益計算書に表示するタイトル。上書きタイトルがあればそれ、無ければ元の名称。
// 元の名称は各行の name / matterTitle が保持する
export type DisplayTitle = {
  displayTitle: string;
  isCustomTitle: boolean; // 上書きタイトルを表示しているか（元の名称をツールチップで示す）
};

// ===== 損益計算書の明細行（ライブ集計・確定スナップショットの共通形） =====
// 損益計算書は「取得した行（または確定明細）→ 明細行（*Line）→ 集計」の 2 段階で組み立てる。
// 明細行は集計・表示に必要な属性と実績額を持ち、元テーブルの行そのものには依存しない。

// 案件の売上明細（1 business 行 = 1 行。実績額修正の対象単位）
export type BusinessLine = AdjustableAmount & {
  businessId: number;
  name: string; // 取引先名（同一案件に複数の business 行がある場合の識別用）
  matterId: number;
  matterUserId: number; // 案件の作成者（matters.user_id。確定明細の RLS 用）
  matterTitle: string;
  category: string; // 案件の分類（matters.category）
  team: string; // 案件のチーム（matters.team）
};

// 案件費用の明細（1 costs 行 = 1 行。実績額修正の対象単位）
export type CostLine = AdjustableAmount & {
  costId: number;
  name: string; // コスト名（同一案件・同一品目に複数の costs 行がある場合の識別用）
  item: string; // 品目
  matterId: number;
  matterUserId: number; // 案件の作成者（matters.user_id。確定明細の RLS 用）
  matterTitle: string;
  category: string;
  team: string;
};

// 定期費用（管理費）の明細（1 recurring_costs 行 = 1 行。実績額修正の対象単位）
export type RecurringCostLine = AdjustableAmount & {
  recurringCostId: number;
  name: string;
  item: string; // 費目（recurring_costs.item）
  team: string | null; // NULL = 全体共通
  paymentCycle: string;
};

// 経理追加収支の明細（1 extra_entries 行 = 1 行）
export type ExtraEntryLine = {
  extraEntryId: number;
  entryType: string; // "income" | "expense"
  category: string;
  description: string;
  team: string | null; // NULL = 全体共通
  entryDate: string | null;
  billingAmount: number | null; // 請求額（収入のみ）→ 売上
  expenseAmount: number | null; // 経費 → 案件費用
};

// 1 ヶ月分の明細行（ロールによる算入 / 参考表示の振り分け前）
export type PLMonthLines = {
  businesses: BusinessLine[];
  costs: CostLine[];
  recurringCosts: RecurringCostLine[];
  extraEntries: ExtraEntryLine[];
};

// 表示タイトルを解決済みの明細行（集計結果の表示用）
export type TitledBusinessLine = BusinessLine & DisplayTitle;
export type TitledCostLine = CostLine & DisplayTitle;
export type TitledRecurringCostLine = RecurringCostLine & DisplayTitle;

// ===== 案件別収支（チーム → 案件 → 案件内訳） =====

// 案件行（案件の売上・案件費用・粗利と、展開時の案件内訳）。
// displayTitle は上書きタイトル（無ければ matterTitle = 元の案件名）
export type MatterBreakdown = DisplayTitle & {
  matterId: number;
  matterTitle: string;
  category: string;
  team: string;
  revenue: number; // 売上明細の実績額合計
  cost: number; // 費用明細の実績額合計
  grossProfit: number; // revenue − cost
  businesses: TitledBusinessLine[]; // ID の昇順
  costs: TitledCostLine[]; // ID の昇順
};

// チーム行（チーム内の案件と、案件に紐づかない経理追加収支）
export type TeamMatterGroup = {
  team: string | null; // NULL = 全体共通（チーム未指定の経理追加収支。accounting / admin のみ）
  revenue: number; // チーム小計（案件＋経理追加収支）
  cost: number;
  grossProfit: number;
  matters: MatterBreakdown[]; // 案件 ID の昇順
  extraEntries: ExtraEntryLine[]; // 経理追加収支（案件外）。ID の昇順
  extraRevenue: number; // 経理追加収支（案件外）行の売上（収入の請求額）
  extraCost: number; // 経理追加収支（案件外）行の案件費用（経費）
};

// 分類別収支（売上分類の大分類ごとに 売上 − 案件費用 を集計）
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
  details: TitledRecurringCostLine[];
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
  matterCostTotal: number; // 案件費用合計（経理追加収支の経費を含む）
  grossProfitTotal: number; // 売上総利益（粗利）= 売上合計 − 案件費用合計
  teamMatterGroups: TeamMatterGroup[]; // 案件別収支（チーム小計の合計は売上合計・案件費用合計と一致）
  categoryBreakdown: GrossProfitBreakdown[]; // 分類別収支（合計は案件別収支の合計と一致）
  recurringCostTotal: number; // 管理費合計（teamleader は自チーム分のみ算入）
  recurringCostByItem: RecurringCostItemBreakdown[]; // 費目別管理費内訳（定期費用の明細を含む）
  orgWideRecurringCosts?: TitledRecurringCostLine[]; // teamleader 向け「全体共通（参考）」（損益に算入しない）
  extraEntries: ExtraEntryLine[]; // 経理追加収支明細（teamleader は自チーム分のみ。損益に算入済み）
  orgWideExtraEntries?: ExtraEntryLine[]; // teamleader 向け「全体共通（参考）」（損益に算入しない）
  ordinaryProfit: number; // 経常利益 = 粗利合計 − 管理費合計（= 売上 − 案件費用 − 管理費）
  byTeam?: TeamBreakdown[]; // チーム別内訳（accounting / admin のみ）
  undated: { revenue: number; matterCost: number }; // 月未確定（案件開始日・日付未入力。下書きの案件は除く）
  // 対象月に調整はあるが対象行が当月に存在しない（案件開始日の変更等）ため、
  // 損益に反映されず削除待ちの調整（accounting / admin のみ。includeTeamBreakdown と同じロール判定）
  orphanedAdjustments?: OrphanedAdjustmentType[];
  // 月次収支確定の情報（Issue #148）。確定済みの月は確定明細（スナップショット）から
  // 集計した値を返す。未確定の月は null（ライブ集計）
  closing?: ClosingInfo | null;
  // 確定後の案件の変更（確定明細とライブ集計の差分。Issue #149）。
  // 確定済みの月かつ accounting / admin のみ（チームリーダーには見せない）
  closingDiffs?: ClosingDiffResult;
};

// ===== 月次収支確定（profit_loss_closings / profit_loss_closing_lines）関連 =====

type ProfitLossClosingsTable =
  Database["public"]["Tables"]["profit_loss_closings"];
export type ProfitLossClosingType = ProfitLossClosingsTable["Row"];
type ProfitLossClosingLinesTable =
  Database["public"]["Tables"]["profit_loss_closing_lines"];
export type ProfitLossClosingLineType = ProfitLossClosingLinesTable["Row"];

// 確定明細の種別（profit_loss_closing_lines.source_type）
export type ClosingSourceType =
  | "business"
  | "cost"
  | "recurring_cost"
  | "extra_entry";

// 確定明細の保存用の 1 行（save_profit_loss_closing の p_lines の要素）
export type ClosingLineInput = Omit<
  ProfitLossClosingLineType,
  "id" | "closing_id"
>;

// 画面に表示する確定情報（確定者・反映者は確定時点の氏名）
export type ClosingInfo = {
  month: string; // "YYYY-MM"
  closedAt: string;
  closedByName: string;
  refreshedAt: string | null; // 最終反映日時（Issue #149。未反映は null）
  refreshedByName: string | null;
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
// partialWriteFailed は複数ステップの書き込みの途中で失敗し、直前までの変更が
// 反映済みの可能性がある場合に限って使う（budgetRecurringItems.ts の一括更新等。
// budget_declarations の保存は save_budget_declaration（migration 24）内の
// 単一トランザクションのためこの状態にならず、このキーを返さない）。
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

// ===== 確定後の変更検知・反映・見送り（Issue #149） =====

type ProfitLossClosingDismissalsTable =
  Database["public"]["Tables"]["profit_loss_closing_dismissals"];
export type ProfitLossClosingDismissalType =
  ProfitLossClosingDismissalsTable["Row"];

// 変更検知の対象（案件の売上・費用の明細のみ）
export type DiffSourceType = "business" | "cost";

// 明細の特定キー（反映・見送りの Server Action に渡す）
export type ClosingDiffKey = { sourceType: DiffSourceType; sourceId: number };

// 差分の種類。金額変更・区分変更（分類・チーム）は同時に起こりうるため changed に
// フラグで持つ
export type ClosingDiffKind = "added" | "removed" | "changed";

// 差分の比較に使う明細の状態（金額・区分）
export type DiffLineState = {
  actualAmount: number;
  team: string;
  category: string;
};

// 確定明細から消えた（removed）理由。ライブの行を ID で引いて判定する
export type RemovedReason = "moved" | "undated" | "draft" | "deleted";

export type ClosingDiff = {
  key: string; // "business:1" 形式（ClosingDiffKey の文字列表現）
  sourceType: DiffSourceType;
  sourceId: number;
  kind: ClosingDiffKind;
  amountChanged: boolean;
  classificationChanged: boolean; // 分類・チームの変更
  matterId: number;
  matterTitle: string; // 表示タイトル（上書きタイトル → 最新の案件名 → 確定時点の案件名）
  name: string; // 明細の表示タイトル（同上）
  item: string | null; // 品目（費用明細のみ）
  before: DiffLineState | null; // 確定値（追加は null）
  after: DiffLineState | null; // 最新の値（削除は null）
  delta: number; // 実績額の差（after − before。無い側は 0）
  // 他の月との移動（案件開始日の変更）。added は移動元、removed は移動先の月（"YYYY-MM"）
  movedMonth: string | null;
  movedMonthClosed: boolean; // 移動の相手側の月も確定済みか（片方だけ反映すると両月の合計がずれる）
  removedReason: RemovedReason | null;
  dismissal: { dismissedAt: string; dismissedByName: string } | null; // 見送り済みのみ
};

export type ClosingDiffResult = {
  pending: ClosingDiff[]; // 未処理（反映も見送りもしていない）
  dismissed: ClosingDiff[]; // 見送り済み（見送った時点から変化していないもの）
};

// ページ上部のバナー用（未処理の差分がある確定済みの月と件数）
export type ClosingDiffSummary = { month: string; count: number }[];
