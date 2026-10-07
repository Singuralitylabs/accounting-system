import type { BudgetDeclarationReminderDay } from "../utils/budgetDeclarationReminder";
import type { MatterNoticeSettings } from "../utils/slackNotificationTemplate";
import { Database } from "../lib/database.types";

export type PageTitleProps = {
  title: string;
  // Layout class aligning the title with each page's content width.
  className?: string;
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
  assignee?: string;
  matterId?: number;
  matterTitle?: string;
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

// ===== Profit and loss statement =====

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

// ===== Profit/loss adjustments (profit_loss_adjustments) =====
// Source rows are never modified; per-month actual-amount corrections live in a separate table.

type ProfitLossAdjustmentsTable =
  Database["public"]["Tables"]["profit_loss_adjustments"];
export type ProfitLossAdjustmentType = ProfitLossAdjustmentsTable["Row"];
export type ProfitLossAdjustmentInsertType =
  ProfitLossAdjustmentsTable["Insert"];

export type AdjustmentTargetType = "business" | "cost" | "recurring_cost";

export type AdjustmentTarget =
  | { targetType: "business"; businessId: number }
  | { targetType: "cost"; costId: number }
  | { targetType: "recurring_cost"; recurringCostId: number };

// Common source / adjustment / actual triple. sourceChanged: source changed after the adjustment was saved (compared with source_amount_snapshot).
export type AdjustableAmount = {
  sourceAmount: number;
  adjustmentAmount: number;
  actualAmount: number;
  sourceChanged: boolean;
  adjustment: ProfitLossAdjustmentType | null; // null; always null in closing snapshots
  adjustmentReason: string | null; // kept in closing snapshots too
};

// An adjustment whose target row no longer exists in the month (e.g. matter start date moved); shown to prompt deletion.
export type OrphanedAdjustmentType = {
  adjustment: ProfitLossAdjustmentType;
  targetType: AdjustmentTargetType;
  label: string;
  // Closed months only: whether the target row is included in the closing lines.
  includedInClosing?: boolean;
};

// ===== Display titles on the statement (profit_loss_labels) =====
// Overrides apply only on the statement, for all months.

type ProfitLossLabelsTable = Database["public"]["Tables"]["profit_loss_labels"];
export type ProfitLossLabelType = ProfitLossLabelsTable["Row"];

export type LabelTarget =
  | { targetType: "matter"; matterId: number }
  | { targetType: "business"; businessId: number }
  | { targetType: "cost"; costId: number }
  | { targetType: "recurring_cost"; recurringCostId: number };

// Override title if present, else the original name (kept in name / matterTitle).
export type DisplayTitle = {
  displayTitle: string;
  isCustomTitle: boolean;
};

// ===== Statement line items (shared by live aggregation and closing snapshots) =====

export type BusinessLine = AdjustableAmount & {
  businessId: number;
  name: string;
  matterId: number;
  matterUserId: number; // matters.user_id; used by RLS on closing lines
  matterTitle: string;
  category: string;
  team: string;
};

export type CostLine = AdjustableAmount & {
  costId: number;
  name: string;
  item: string;
  matterId: number;
  matterUserId: number; // matters.user_id; used by RLS on closing lines
  matterTitle: string;
  category: string;
  team: string;
};

export type RecurringCostLine = AdjustableAmount & {
  recurringCostId: number;
  name: string;
  item: string;
  team: string | null; // NULL = shared by all teams
  paymentCycle: string;
};

export type ExtraEntryLine = {
  extraEntryId: number;
  entryType: string; // "income" | "expense"
  category: string;
  description: string;
  team: string | null; // NULL = shared by all teams
  entryDate: string | null;
  billingAmount: number | null;
  // Expense: income entries count as matter cost (gross profit), expense entries as admin cost.
  expenseAmount: number | null;
};

export type PLMonthLines = {
  businesses: BusinessLine[];
  costs: CostLine[];
  recurringCosts: RecurringCostLine[];
  extraEntries: ExtraEntryLine[];
};

export type TitledBusinessLine = BusinessLine & DisplayTitle;
export type TitledCostLine = CostLine & DisplayTitle;
export type TitledRecurringCostLine = RecurringCostLine & DisplayTitle;

// ===== Per-matter results (matter -> line items) =====

// displayTitle is the override title, else matterTitle (the original name).
export type MatterBreakdown = DisplayTitle & {
  matterId: number;
  matterTitle: string;
  // Classifications/teams of the lines (deduplicated, first-seen order). Usually one, but a partially applied closed month can yield several; per-category and per-team totals use each line's own value.
  categories: string[];
  teams: string[];
  revenue: number;
  cost: number;
  grossProfit: number;
  businesses: TitledBusinessLine[];
  costs: TitledCostLine[];
};

export type ProfitTotals = {
  revenue: number;
  cost: number;
  grossProfit: number;
};

// Matter totals only (excludes extra entries); shown identically in the gross-profit "matter" row and the per-matter total row.
export type MatterTotals = ProfitTotals;

// Gross profit per revenue category (matters only); breakdown of the gross-profit "matter" row.
export type GrossProfitBreakdown = {
  category: string;
  revenue: number;
  cost: number;
  grossProfit: number;
};

export type RecurringCostItemBreakdown = {
  item: string;
  amount: number;
  details: TitledRecurringCostLine[];
};

export type ExtraIncomeLine = ExtraEntryLine & { grossProfit: number };

export type ExtraIncomeSection = ProfitTotals & { entries: ExtraIncomeLine[] };

export type ExtraExpenseSection = { total: number; entries: ExtraEntryLine[] };

export type TeamBreakdown = {
  team: string;
  revenue: number;
  matterCost: number;
  grossProfit: number;
  adminCost: number;
  profit: number;
};

export type PLReportType = {
  month: string; // "YYYY-MM"
  revenueTotal: number;
  // Matter cost + expenses of income extra entries (expense entries go to admin cost).
  matterCostTotal: number;
  grossProfitTotal: number;
  matterBreakdowns: MatterBreakdown[];
  matterTotals: MatterTotals;
  categoryBreakdown: GrossProfitBreakdown[];
  // Extra entries are split into income/expense once here (the UI only displays).
  extraIncome: ExtraIncomeSection;
  recurringCostTotal: number;
  recurringCostByItem: RecurringCostItemBreakdown[];
  extraExpense: ExtraExpenseSection;
  // Precomputed here like revenue and profit totals.
  adminCostTotal: number;
  ordinaryProfit: number;
  byTeam?: TeamBreakdown[];
  // Undated (start date missing; drafts excluded). adminCost is the expense of undated expense entries.
  undated: { revenue: number; matterCost: number; adminCost: number };
  // Adjustments whose target row is absent from the month; accounting/admin only (same role check as includeAdjustmentDetails).
  orphanedAdjustments?: OrphanedAdjustmentType[];
  // Closing info; closed months are aggregated from closing lines, open months are null (live).
  closing?: ClosingInfo | null;
  // Post-closing changes (closing lines vs live); closed months, accounting/admin only.
  closingDiffs?: ClosingDiffResult;
};

type ProfitLossClosingsTable =
  Database["public"]["Tables"]["profit_loss_closings"];
export type ProfitLossClosingType = ProfitLossClosingsTable["Row"];
type ProfitLossClosingLinesTable =
  Database["public"]["Tables"]["profit_loss_closing_lines"];
export type ProfitLossClosingLineType = ProfitLossClosingLinesTable["Row"];

export type ClosingSourceType =
  | "business"
  | "cost"
  | "recurring_cost"
  | "extra_entry";

export type ClosingLineInput = Omit<
  ProfitLossClosingLineType,
  "id" | "closing_id"
>;

export type ClosingInfo = {
  month: string; // "YYYY-MM"
  closedAt: string;
  closedByName: string;
  refreshedAt: string | null;
  refreshedByName: string | null;
};

export type AnnualTrendType = {
  fiscalYear: number;
  // 12 months from July. Titles (profit_loss_labels) are not fetched, so displayTitle is the original name and isCustomTitle is always false; do not use for display.
  months: PLReportType[];
};

type BudgetDeclarationsTable =
  Database["public"]["Tables"]["budget_declarations"];
export type BudgetDeclarationType = BudgetDeclarationsTable["Row"];

type BudgetDeclarationItemsTable =
  Database["public"]["Tables"]["budget_declaration_items"];
export type BudgetDeclarationItemType = BudgetDeclarationItemsTable["Row"];

export type BudgetClosingInfo = {
  month: string; // "YYYY-MM"
  closedAt: string;
  closedByName: string;
};

export type BudgetClosingsResult =
  | { closings: BudgetClosingInfo[]; error?: undefined }
  | { closings?: undefined; error: AccessFailure };

export type BudgetClosingWriteResult = { error?: AccessFailure };

export type BudgetSummaryType = {
  incomeTotal: number;
  expenseTotal: number;
  balance: number;
};

// notDeclared: no header row; inProgress: header row without completion; declared: completed_at is set.
export type BudgetDeclarationStatus = "notDeclared" | "inProgress" | "declared";

export type BudgetDeclarationStatusType = {
  team: string;
  declarationId: number | null;
  status: BudgetDeclarationStatus;
  itemCount: number;
  declaredByName: string | null; // null when profiles RLS hides the row
  updatedAt: string | null;
  summary: BudgetSummaryType;
};

export type BudgetDeclarationItemWithManagerName = BudgetDeclarationItemType & {
  managerName: string | null;
};

export type BudgetDeclarationDetailType = {
  comment: string | null;
  completed: boolean;
  items: BudgetDeclarationItemWithManagerName[];
};

// forbidden is not recoverable by retry, unlike transient fetchFailed; conflating them causes pointless react-query retries and a wrong "reload later" hint.
// duplicate: unique violation on (target_month, team). validationFailed: client-side validation failure.
// partialWriteFailed: only for multi-step writes that may have partially applied (e.g. bulk recurring-item update); save_budget_declaration is a single transaction and never returns it.
// Plain objects rather than Error: React Flight cannot serialize Error in Server Action results.
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
  | { detail: BudgetDeclarationDetailType | null; error?: undefined }
  | { detail?: undefined; error: AccessFailure };

export type BudgetDeclarationItemInput = {
  entry_type: string;
  category: string;
  description: string;
  amount: number;
  manager_id: number | null;
};

export type BudgetDeclarationSaveInput = {
  declarationId: number | null;
  targetMonth: string; // "YYYY-MM"
  team: string;
  comment: string | null;
  completed: boolean;
  items: BudgetDeclarationItemInput[];
};

export type BudgetDeclarationSaveResult =
  | { id: number; error?: undefined }
  | { id?: undefined; error: AccessFailure };

export type BudgetDeclarationDeleteResult = { error?: AccessFailure };

// Raw DB rows; sorting by display_order is done by the fetcher.
export type BudgetDeclarationPreviousItem = BudgetDeclarationItemInput &
  Pick<BudgetDeclarationItemType, "id" | "display_order">;

export type BudgetDeclarationPreviousItemsResult =
  // items: null means no previous declaration (distinct from an empty one).
  | { items: BudgetDeclarationPreviousItem[] | null; error?: undefined }
  | { items?: undefined; error: AccessFailure };

export type BudgetDeclarationReminderSettingsResult =
  | { days: BudgetDeclarationReminderDay[]; error?: undefined }
  | { days?: undefined; error: AccessFailure };

export type BudgetDeclarationReminderSettingsSaveResult = {
  error?: AccessFailure;
};

type BudgetRecurringItemsTable =
  Database["public"]["Tables"]["budget_recurring_items"];
export type BudgetRecurringItemType = BudgetRecurringItemsTable["Row"];

// Local edit state (isNew/isRemoved) is never sent to the server.
export type BudgetRecurringItemInListType = BudgetRecurringItemType & {
  isNew: boolean;
  isRemoved: boolean;
};

export type BudgetRecurringItemListResult =
  | { items: BudgetRecurringItemType[]; error?: undefined }
  | { items?: undefined; error: AccessFailure };

export type BudgetRecurringItemSaveResult = { error?: AccessFailure };

// Recurring items active in the target month, seeded into a new declaration form. Same shape as BudgetDeclarationPreviousItem, so the type is reused.
export type ActiveBudgetRecurringItemsResult =
  // Always an array: no active items is normal, unlike items: null above.
  | { items: BudgetDeclarationPreviousItem[]; error?: undefined }
  | { items?: undefined; error: AccessFailure };

type ProfitLossClosingDismissalsTable =
  Database["public"]["Tables"]["profit_loss_closing_dismissals"];
export type ProfitLossClosingDismissalType =
  ProfitLossClosingDismissalsTable["Row"];

export type DiffSourceType = "business" | "cost";

export type ClosingDiffKey = { sourceType: DiffSourceType; sourceId: number };

// Selected lines with the state the user saw; the server rejects if it differs from the current state (changed after display).
export type ClosingDiffSelection = ClosingDiffKey & {
  expected: {
    present: boolean;
    actualAmount: number | null;
    team: string | null;
    category: string | null;
  };
};

export type ClosingDiffKind = "added" | "removed" | "changed";

export type DiffLineState = {
  actualAmount: number;
  team: string;
  category: string;
};

export type RemovedReason = "moved" | "undated" | "draft" | "deleted";

export type ClosingDiff = {
  key: string;
  sourceType: DiffSourceType;
  sourceId: number;
  kind: ClosingDiffKind;
  amountChanged: boolean;
  classificationChanged: boolean;
  matterId: number;
  matterTitle: string;
  name: string;
  item: string | null;
  before: DiffLineState | null;
  after: DiffLineState | null;
  delta: number; // after - before (0 when either side is absent)
  movedMonth: string | null;
  movedMonthClosed: boolean;
  removedReason: RemovedReason | null;
  dismissal: { dismissedAt: string; dismissedByName: string } | null;
};

export type ClosingDiffResult = {
  pending: ClosingDiff[];
  dismissed: ClosingDiff[];
  // Failed to fetch move info (unknown whether the counterpart month is closed); the UI warns and blocks applying.
  moveInfoUnavailable?: boolean;
};

export type ClosingDiffSummary = { month: string; count: number }[];

// Count of pending diffs. Months before fromMonth are outside the count.
export type ClosingDiffSummaryData = {
  summary: ClosingDiffSummary;
  fromMonth: string; // "YYYY-MM"
};

export type SlackNotificationSettingsResult =
  | { settings: MatterNoticeSettings; error?: undefined }
  | { settings?: undefined; error: AccessFailure };

export type SlackNotificationSettingsSaveResult = {
  error?: AccessFailure;
};
