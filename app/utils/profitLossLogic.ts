// 損益計算書の集計ロジック（純粋関数）。
// Supabase アクセス（"use server" が付く app/utils/supabase/profitLossReport.ts）から
// 切り離しているのは、副作用なしでユニットテストできるようにするため
// （docs/testing.md「2.6 テスト容易化リファクタリング方針」）。

import {
  AdjustableAmount,
  BusinessLine,
  CostLine,
  DisplayTitle,
  ExtraEntryLine,
  ExtraEntryType,
  GrossProfitBreakdown,
  MatterBreakdown,
  OrphanedAdjustmentType,
  PLMonthLines,
  PLReportType,
  ProfitLossAdjustmentType,
  ProfitLossLabelType,
  RecurringCostItemBreakdown,
  RecurringCostLine,
  RecurringCostType,
  TeamBreakdown,
  TeamMatterGroup,
  TitledBusinessLine,
  TitledCostLine,
  TitledRecurringCostLine,
} from "../types/types";
import { ORG_WIDE_TEAM_LABEL } from "./constants";
import { hasClassAccess } from "./permissions";

// 集計対象の行が属する案件の属性。
// 計上月は案件開始日（start_date）の月で判定し（Issue #146）、下書きの案件は集計から除外する。
// category は案件費用を売上分類（大分類）別の粗利へ振り分けるために使う
export type MatterOfRow = {
  id: number;
  title: string;
  team: string;
  category: string;
  start_date: string | null;
  is_fixed: boolean | null;
  is_completed: boolean | null;
};

// 集計対象の行（RLS により権限に応じた行のみ取得される）
export type BusinessRow = {
  id: number;
  name: string; // 取引先名。同一案件に複数の business 行がある場合の識別に使う
  amount: number | null;
  matter_id: number;
  matters: MatterOfRow;
};

export type CostRow = {
  id: number;
  name: string; // コスト名。同一案件・同一品目に複数の costs 行がある場合の識別に使う
  price: number;
  item: string;
  matter_id: number;
  matters: MatterOfRow;
};

// 日付文字列（YYYY-MM-DD）から月キー（YYYY-MM）を取り出す。
// タイムゾーン変換による月ズレを避けるため Date オブジェクトは使わない。
const toMonthKey = (dateStr: string | null): string | null =>
  dateStr ? dateStr.slice(0, 7) : null;

// 下書き（経理申請前）の案件か。下書きは損益計算書のどこにも計上しない（Issue #146）。
// is_fixed / is_completed は DB 上 NULL 許容のため NULL は false として扱う。
// 取得側の絞り込み（matterPeriodFilter）と同じ定義。
export const isDraftMatter = (
  matter: Pick<MatterOfRow, "is_fixed" | "is_completed">,
): boolean => matter.is_fixed !== true && matter.is_completed !== true;

// 案件の売上・費用を計上する月（案件開始日の月。未入力は null = 月未確定）
export const matterMonthKey = (
  matter: Pick<MatterOfRow, "start_date">,
): string | null => toMonthKey(matter.start_date);

// 支払サイクルごとの間隔（月数）
const CYCLE_MONTHS: Record<string, number> = {
  monthly: 1,
  quarterly: 3,
  yearly: 12,
};

// 月キー（YYYY-MM）同士の月数差
export const monthDiff = (fromMonth: string, toMonth: string): number => {
  const fromYear = parseInt(fromMonth.slice(0, 4), 10);
  const fromMonthNumber = parseInt(fromMonth.slice(5, 7), 10);
  const toYear = parseInt(toMonth.slice(0, 4), 10);
  const toMonthNumber = parseInt(toMonth.slice(5, 7), 10);
  return (toYear - fromYear) * 12 + (toMonthNumber - fromMonthNumber);
};

// 定期費用が指定月に計上されるか。
// 適用期間内（end_month の月を含む）かつ、支払月（start_month を起点に
// 支払サイクル間隔ごと）に一致する月にのみ全額を計上する。
export const isRecurringCostChargedInMonth = (
  recurringCost: RecurringCostType,
  month: string,
): boolean => {
  const start = recurringCost.start_month.slice(0, 7);
  const end = recurringCost.end_month
    ? recurringCost.end_month.slice(0, 7)
    : null;
  if (!(start <= month && (end === null || month <= end))) {
    return false;
  }
  const cycleMonths = CYCLE_MONTHS[recurringCost.payment_cycle] ?? 1;
  return monthDiff(start, month) % cycleMonths === 0;
};

// ロール（profiles.class）からレポートの挙動フラグを導出する。
export const reportFlags = (profileClass: string | null | undefined) => ({
  isTeamLeader: profileClass === "teamleader",
  includeTeamBreakdown: hasClassAccess(["accounting", "admin"], profileClass),
});

// 損益レポートの取得期間（両端を含む月キー "YYYY-MM"）。
// 月次は { startMonth: month, endMonth: month }、年間推移は年度12ヶ月の両端を渡す。
// 月単位まで絞ると年間推移が12回クエリになるため、年度範囲で1回取得する。
export type ReportPeriod = {
  startMonth: string;
  endMonth: string;
};

// 月キー（"YYYY-MM"）の形式検証。
// Server Action 経由でクライアント到達可能な取得期間の入口で使い、
// 不正な値は呼び出し側で取得失敗（再取得を促す表示）として扱う。
export const isMonthKey = (value: string): boolean =>
  /^\d{4}-(0[1-9]|1[0-2])$/.test(value);

export type ReportRangeBounds = {
  // 期間開始月の月初日（"YYYY-MM-01"。以上条件に使う）
  startDate: string;
  // 期間終了月の翌月月初日（"YYYY-MM-01"。未満条件に使う）
  endExclusive: string;
};

// 月キー（"YYYY-MM"）の翌月の月初日を返す。
// 日付の月ズレを避けるため Date オブジェクトは使わない。
const firstDayOfNextMonth = (monthKey: string): string => {
  const year = parseInt(monthKey.slice(0, 4), 10);
  const monthNumber = parseInt(monthKey.slice(5, 7), 10);
  const nextYear = monthNumber === 12 ? year + 1 : year;
  const nextMonthNumber = monthNumber === 12 ? 1 : monthNumber + 1;
  return `${nextYear}-${String(nextMonthNumber).padStart(2, "0")}-01`;
};

// 取得期間から日付範囲（[startDate, endExclusive)）を求める。
// SQL の WHERE 句とインメモリのフィルタで同じ境界を使うための単一の定義。
// 呼び出し側は startMonth <= endMonth を満たすこと（逆転させると空範囲＋NULL 行のみの取得になる）。
export const reportRangeBounds = (period: ReportPeriod): ReportRangeBounds => ({
  startDate: `${period.startMonth}-01`,
  endExclusive: firstDayOfNextMonth(period.endMonth),
});

// 日付カラムが取得期間内または月未確定（NULL）か。
// matters.start_date / entry_date の絞り込みで NULL 行を落とさないための条件。
export const isDateInRangeOrUndated = (
  dateStr: string | null,
  bounds: ReportRangeBounds,
): boolean =>
  dateStr === null ||
  (dateStr >= bounds.startDate && dateStr < bounds.endExclusive);

// 案件の行（business / costs）が取得対象か（matterPeriodFilter のインメモリ版）。
// 下書きでなく、案件開始日が取得期間内または未入力（月未確定）のもの。
export const isMatterInRangeOrUndated = (
  matter: Pick<MatterOfRow, "start_date" | "is_fixed" | "is_completed">,
  bounds: ReportRangeBounds,
): boolean =>
  !isDraftMatter(matter) && isDateInRangeOrUndated(matter.start_date, bounds);

// 定期費用マスタの適用期間が取得期間と重なるか。
// 支払サイクルによる計上月の判定は行わない（buildMonthlyReport 側で行う）。
// 適用期間が取得期間と重ならない行だけを除外するための条件。
export const doesRecurringCostOverlapRange = (
  recurringCost: Pick<RecurringCostType, "start_month" | "end_month">,
  bounds: ReportRangeBounds,
): boolean =>
  recurringCost.start_month < bounds.endExclusive &&
  (recurringCost.end_month === null ||
    recurringCost.end_month >= bounds.startDate);

// 調整の対象月が取得期間内か（target_month は NOT NULL のため NULL 扱いは不要）。
export const isAdjustmentInRange = (
  targetMonth: string,
  bounds: ReportRangeBounds,
): boolean =>
  targetMonth >= bounds.startDate && targetMonth < bounds.endExclusive;

// 調整の対象行のうち取得済み ID に無いもの（取得期間外へ移動した行）を集める。
// orphanedAdjustments のラベル解決用。対象は buildMonthlyReport と同じく
// target_month が当月の調整のみ。追加取得した行は月振り分け（厳密な月一致・
// undated は NULL のみ・定期費用は計上月判定）で集計から除外されるため集計値は不変。
export const collectMissingAdjustmentTargetIds = (
  month: string,
  adjustments: Pick<
    ProfitLossAdjustmentType,
    "target_month" | "business_id" | "cost_id" | "recurring_cost_id"
  >[],
  businessIds: ReadonlySet<number>,
  costIds: ReadonlySet<number>,
  recurringCostIds: ReadonlySet<number>,
): { businessIds: number[]; costIds: number[]; recurringCostIds: number[] } => {
  const missingBusinessIds = new Set<number>();
  const missingCostIds = new Set<number>();
  const missingRecurringCostIds = new Set<number>();
  adjustments
    .filter((adjustment) => toMonthKey(adjustment.target_month) === month)
    .forEach((adjustment) => {
      if (
        adjustment.business_id !== null &&
        !businessIds.has(adjustment.business_id)
      ) {
        missingBusinessIds.add(adjustment.business_id);
      }
      if (adjustment.cost_id !== null && !costIds.has(adjustment.cost_id)) {
        missingCostIds.add(adjustment.cost_id);
      }
      if (
        adjustment.recurring_cost_id !== null &&
        !recurringCostIds.has(adjustment.recurring_cost_id)
      ) {
        missingRecurringCostIds.add(adjustment.recurring_cost_id);
      }
    });
  return {
    businessIds: Array.from(missingBusinessIds),
    costIds: Array.from(missingCostIds),
    recurringCostIds: Array.from(missingRecurringCostIds),
  };
};

// Supabase（PostgREST）の or() に渡す日付絞り込み条件「期間内 OR 月未確定（NULL）」。
// extra_entries.entry_date 用。SQL とテストで同じ文字列を使うための単一の定義。
// column は union 型に絞り、任意文字列の混入を型で防ぐ。
export const datedOrUndatedFilter = (
  column: "entry_date" | "start_date",
  bounds: ReportRangeBounds,
): string =>
  `and(${column}.gte.${bounds.startDate},${column}.lt.${bounds.endExclusive}),${column}.is.null`;

// business / costs の取得で埋め込みリソース matters（!inner）に掛ける or() 条件。
// 「案件開始日が期間内 OR 未入力（月未確定）」かつ「下書きでない」（isDraftMatter の否定）。
// supabase-js の or() は referencedTable ごとに 1 つの or= パラメータになるため、
// 2 つの条件を 1 つの論理式にまとめる（(下書きでない AND 期間内) OR (下書きでない AND NULL)）。
// is.true を使うのは、NULL を false と同じく「下書き側」に倒すため（isDraftMatter と同じ）。
export const matterPeriodFilter = (bounds: ReportRangeBounds): string => {
  const notDraft = "or(is_fixed.is.true,is_completed.is.true)";
  return `and(${notDraft},start_date.gte.${bounds.startDate},start_date.lt.${bounds.endExclusive}),and(${notDraft},start_date.is.null)`;
};

// 定期費用の適用終了側の or() 条件（`start_month < endExclusive` と AND で使う）。
// 適用期間が取得期間と重ならない行だけを除外するための条件。
export const recurringOverlapEndFilter = (bounds: ReportRangeBounds): string =>
  `end_month.gte.${bounds.startDate},end_month.is.null`;

// buildMonthlyReport の入力。
// boolean フラグが複数あるため、呼び出し側での取り違えを防ぐ目的で
// 位置引数ではなくオブジェクトで受ける。
export type MonthlyReportInput = {
  month: string;
  businessRows: BusinessRow[];
  costRows: CostRow[];
  recurringCosts: RecurringCostType[];
  extraEntries: ExtraEntryType[];
  adjustments: ProfitLossAdjustmentType[];
  isTeamLeader: boolean;
  includeTeamBreakdown: boolean; // チーム別内訳を含めるか（accounting / admin）
  // 対象行が当月に存在しない調整（orphanedAdjustments）を計算するか。
  // 年間推移（12ヶ月分を一括計算）は表示に使わないため false を渡し、
  // 12ヶ月分の無駄な計算を避ける（月次タブの単月表示でのみ true）
  includeOrphanedAdjustments: boolean;
  // 案件別収支のチームの並び順（項目管理のチームマスタの display_order 順）。
  // マスタに無いチーム（無効化・削除済み）は後ろに名称順で並ぶ
  teamOrder?: string[];
  // 損益計算書上の表示タイトル（Issue #150。RLS により閲覧できる行のみ）
  labels?: ProfitLossLabelType[];
};

// ===== 表示タイトル（Issue #150） =====

// 上書きタイトルの索引（対象種別ごとに id → タイトル）
export type LabelIndex = {
  matter: Map<number, string>;
  business: Map<number, string>;
  cost: Map<number, string>;
  recurringCost: Map<number, string>;
};

export const buildLabelIndex = (
  labels: Pick<
    ProfitLossLabelType,
    "matter_id" | "business_id" | "cost_id" | "recurring_cost_id" | "label"
  >[] = [],
): LabelIndex => {
  const index: LabelIndex = {
    matter: new Map(),
    business: new Map(),
    cost: new Map(),
    recurringCost: new Map(),
  };
  labels.forEach((label) => {
    if (label.matter_id !== null) {
      index.matter.set(label.matter_id, label.label);
    } else if (label.business_id !== null) {
      index.business.set(label.business_id, label.label);
    } else if (label.cost_id !== null) {
      index.cost.set(label.cost_id, label.label);
    } else if (label.recurring_cost_id !== null) {
      index.recurringCost.set(label.recurring_cost_id, label.label);
    }
  });
  return index;
};

// 表示タイトルの解決（上書きタイトル → 元の名称）
export const resolveTitle = (
  originalTitle: string,
  customTitle: string | undefined,
): DisplayTitle => ({
  displayTitle: customTitle ?? originalTitle,
  isCustomTitle: customTitle !== undefined,
});

// タイトル入力の正規化。前後の空白を除去し、空になった場合は null
// （= 上書きを削除して元の名称に戻す）を返す。DB 関数 save_profit_loss_label と同じ扱い
export const normalizeLabelInput = (input: string): string | null => {
  const trimmed = input.trim();
  return trimmed === "" ? null : trimmed;
};

// 表示タイトルの最大文字数（DB の CHECK 制約 char_length(label) <= 200 と揃える）
export const LABEL_MAX_LENGTH = 200;

type AdjustmentKey = "business_id" | "cost_id" | "recurring_cost_id";

// adjustments 配列から「対象列 + id + 対象月」で引ける索引を作る。
// 明細行数 × 調整件数の総当たりだと調整が積み上がるほど遅くなるため、
// 呼び出しごとに一度だけ Map 化して O(1) 参照にする
const buildAdjustmentIndex = (
  adjustments: ProfitLossAdjustmentType[],
  month: string,
): Map<string, ProfitLossAdjustmentType> => {
  const index = new Map<string, ProfitLossAdjustmentType>();
  adjustments.forEach((adjustment) => {
    if (toMonthKey(adjustment.target_month) !== month) return;
    const key: AdjustmentKey =
      adjustment.business_id !== null
        ? "business_id"
        : adjustment.cost_id !== null
          ? "cost_id"
          : "recurring_cost_id";
    index.set(`${key}:${adjustment[key]}`, adjustment);
  });
  return index;
};

const findAdjustment = (
  index: Map<string, ProfitLossAdjustmentType>,
  key: AdjustmentKey,
  id: number,
): ProfitLossAdjustmentType | undefined => index.get(`${key}:${id}`);

// 元データの金額と調整から「元データ / 調整 / 実績」の3値を組み立てる。
// 実績額は常に「現在の元データ金額 + 調整の差分」で計算する（調整保存後に元データが
// 変わっても、調整の差分自体は自動更新しない。sourceChanged で警告を出すのみ）
const toAdjustable = (
  sourceAmount: number,
  adjustment: ProfitLossAdjustmentType | undefined,
): AdjustableAmount => {
  const adjustmentAmount = adjustment?.adjustment_amount ?? 0;
  return {
    sourceAmount,
    adjustmentAmount,
    actualAmount: sourceAmount + adjustmentAmount,
    sourceChanged: adjustment
      ? adjustment.source_amount_snapshot !== sourceAmount
      : false,
    adjustment: adjustment ?? null,
    adjustmentReason: adjustment?.reason ?? null,
  };
};

const byNumber =
  <T>(key: (value: T) => number) =>
  (a: T, b: T) =>
    key(a) - key(b);

// 経理追加収支の行を明細行へ変換する
export const toExtraEntryLine = (entry: ExtraEntryType): ExtraEntryLine => ({
  extraEntryId: entry.id,
  entryType: entry.entry_type,
  category: entry.category,
  description: entry.description,
  team: entry.team,
  entryDate: entry.entry_date,
  billingAmount: entry.billing_amount,
  expenseAmount: entry.expense_amount,
});

// 経理追加収支 1 件が売上・案件費用へ算入する額
// （収入の請求額 → 売上。経費（収入・支出共通）→ 案件費用）
const extraEntryRevenue = (entry: ExtraEntryLine): number =>
  entry.entryType === "income" ? (entry.billingAmount ?? 0) : 0;
const extraEntryCost = (entry: ExtraEntryLine): number =>
  entry.expenseAmount ?? 0;

// 取得済みの行から、指定月に計上される明細行（ライブ集計）を組み立てる。
// ロールによる算入 / 参考表示の振り分けは行わない（aggregateMonthLines 側で行う）。
// 確定（Issue #148）のスナップショットもこの結果をそのまま保存する。
export const buildLiveMonthLines = ({
  month,
  businessRows,
  costRows,
  recurringCosts,
  extraEntries,
  adjustments,
}: Pick<
  MonthlyReportInput,
  | "month"
  | "businessRows"
  | "costRows"
  | "recurringCosts"
  | "extraEntries"
  | "adjustments"
>): PLMonthLines => {
  // 対象月分の調整を1度だけ索引化する（明細行ごとに全件走査しない）
  const adjustmentIndex = buildAdjustmentIndex(adjustments, month);

  // 案件の売上・費用は案件開始日の月に計上し、下書きの案件は除外する（Issue #146）。
  // 取得側でも同じ条件で絞るが、orphanedAdjustments のラベル解決用の補完行
  // （期間外・下書きを含みうる）が混ざるため、ここでも判定する
  const isCountedInMonth = (matter: MatterOfRow) =>
    !isDraftMatter(matter) && matterMonthKey(matter) === month;

  const businesses: BusinessLine[] = businessRows
    .filter((row) => isCountedInMonth(row.matters))
    .map((row) => ({
      ...toAdjustable(
        row.amount ?? 0,
        findAdjustment(adjustmentIndex, "business_id", row.id),
      ),
      businessId: row.id,
      name: row.name,
      matterId: row.matter_id,
      matterTitle: row.matters.title,
      category: row.matters.category,
      team: row.matters.team,
    }))
    .sort(byNumber((line) => line.businessId));

  const costs: CostLine[] = costRows
    .filter((row) => isCountedInMonth(row.matters))
    .map((row) => ({
      ...toAdjustable(
        row.price,
        findAdjustment(adjustmentIndex, "cost_id", row.id),
      ),
      costId: row.id,
      name: row.name,
      item: row.item,
      matterId: row.matter_id,
      matterTitle: row.matters.title,
      category: row.matters.category,
      team: row.matters.team,
    }))
    .sort(byNumber((line) => line.costId));

  const recurringCostLines: RecurringCostLine[] = recurringCosts
    .filter((rc) => isRecurringCostChargedInMonth(rc, month))
    .map((rc) => ({
      ...toAdjustable(
        rc.price,
        findAdjustment(adjustmentIndex, "recurring_cost_id", rc.id),
      ),
      recurringCostId: rc.id,
      name: rc.name,
      item: rc.item,
      team: rc.team,
      paymentCycle: rc.payment_cycle,
    }))
    .sort(byNumber((line) => line.recurringCostId));

  // 計上月は entry_date の属する月（NULL は月未確定として別枠集計）
  const extraEntryLines = extraEntries
    .filter((entry) => toMonthKey(entry.entry_date) === month)
    .map(toExtraEntryLine)
    .sort(byNumber((line) => line.extraEntryId));

  return {
    businesses,
    costs,
    recurringCosts: recurringCostLines,
    extraEntries: extraEntryLines,
  };
};

// 案件別収支のチームの並び順。マスタ（teamOrder）の順 → マスタに無いチームは名称順 →
// 全体共通（NULL）は最後
export const compareTeams = (teamOrder: readonly string[]) => {
  const rank = new Map(teamOrder.map((team, index) => [team, index]));
  return (a: string | null, b: string | null): number => {
    if (a === b) return 0;
    if (a === null) return 1;
    if (b === null) return -1;
    const rankA = rank.get(a);
    const rankB = rank.get(b);
    if (rankA !== undefined && rankB !== undefined) return rankA - rankB;
    if (rankA !== undefined) return -1;
    if (rankB !== undefined) return 1;
    return a.localeCompare(b, "ja");
  };
};

const titledBusinessLine = (
  line: BusinessLine,
  labelIndex: LabelIndex,
): TitledBusinessLine => ({
  ...line,
  ...resolveTitle(line.name, labelIndex.business.get(line.businessId)),
});
const titledCostLine = (
  line: CostLine,
  labelIndex: LabelIndex,
): TitledCostLine => ({
  ...line,
  ...resolveTitle(line.name, labelIndex.cost.get(line.costId)),
});
const titledRecurringCostLine = (
  line: RecurringCostLine,
  labelIndex: LabelIndex,
): TitledRecurringCostLine => ({
  ...line,
  ...resolveTitle(
    line.name,
    labelIndex.recurringCost.get(line.recurringCostId),
  ),
});

// 案件別収支（チーム → 案件 → 案件内訳）を組み立てる。
// 明細行はいずれもちょうど1つのチーム（経理追加収支のチーム未指定は全体共通）・
// 1つの案件（経理追加収支は案件外）に属するため、チーム小計の合計は
// 売上合計・案件費用合計と必ず一致する。
export const buildTeamMatterGroups = (
  businesses: BusinessLine[],
  costs: CostLine[],
  extraEntries: ExtraEntryLine[],
  teamOrder: readonly string[] = [],
  labelIndex: LabelIndex = buildLabelIndex(),
): TeamMatterGroup[] => {
  const groups = new Map<
    string | null,
    { matters: Map<number, MatterBreakdown>; extraEntries: ExtraEntryLine[] }
  >();
  const getGroup = (team: string | null) => {
    if (!groups.has(team)) {
      groups.set(team, { matters: new Map(), extraEntries: [] });
    }
    return groups.get(team)!;
  };
  const getMatter = (line: BusinessLine | CostLine) => {
    const matters = getGroup(line.team).matters;
    if (!matters.has(line.matterId)) {
      matters.set(line.matterId, {
        ...resolveTitle(line.matterTitle, labelIndex.matter.get(line.matterId)),
        matterId: line.matterId,
        matterTitle: line.matterTitle,
        category: line.category,
        team: line.team,
        revenue: 0,
        cost: 0,
        grossProfit: 0,
        businesses: [],
        costs: [],
      });
    }
    return matters.get(line.matterId)!;
  };

  businesses.forEach((line) => {
    const matter = getMatter(line);
    matter.revenue += line.actualAmount;
    matter.businesses.push(titledBusinessLine(line, labelIndex));
  });
  costs.forEach((line) => {
    const matter = getMatter(line);
    matter.cost += line.actualAmount;
    matter.costs.push(titledCostLine(line, labelIndex));
  });
  extraEntries.forEach((entry) => {
    getGroup(entry.team).extraEntries.push(entry);
  });

  return Array.from(groups.entries())
    .sort(([a], [b]) => compareTeams(teamOrder)(a, b))
    .map(([team, group]) => {
      const matters = Array.from(group.matters.values())
        .map((matter) => ({
          ...matter,
          grossProfit: matter.revenue - matter.cost,
          businesses: [...matter.businesses].sort(
            byNumber((line) => line.businessId),
          ),
          costs: [...matter.costs].sort(byNumber((line) => line.costId)),
        }))
        .sort(byNumber((matter) => matter.matterId));
      const sortedExtraEntries = [...group.extraEntries].sort(
        byNumber((line) => line.extraEntryId),
      );
      const extraRevenue = sortedExtraEntries.reduce(
        (sum, entry) => sum + extraEntryRevenue(entry),
        0,
      );
      const extraCost = sortedExtraEntries.reduce(
        (sum, entry) => sum + extraEntryCost(entry),
        0,
      );
      const revenue =
        matters.reduce((sum, matter) => sum + matter.revenue, 0) + extraRevenue;
      const cost =
        matters.reduce((sum, matter) => sum + matter.cost, 0) + extraCost;
      return {
        team,
        revenue,
        cost,
        grossProfit: revenue - cost,
        matters,
        extraEntries: sortedExtraEntries,
        extraRevenue,
        extraCost,
      };
    });
};

// 分類別収支（売上分類の大分類ごとに 売上 − 案件費用）。
// 案件の売上・費用は案件の分類（matters.category）へ、経理追加収支の請求額・経費は
// エントリの分類へ振り分ける。いずれもちょうど1つの分類に属するため、
// 合計は「売上合計 − 案件費用合計」（= 案件別収支の合計）と必ず一致する。
// 分類の値はマスタ（select_options）に追従するため、特定の分類名には依存しない。
export const buildCategoryBreakdown = (
  businesses: BusinessLine[],
  costs: CostLine[],
  extraEntries: ExtraEntryLine[],
): GrossProfitBreakdown[] => {
  const map = new Map<string, { revenue: number; cost: number }>();
  const add = (category: string, revenue: number, cost: number) => {
    const entry = map.get(category) ?? { revenue: 0, cost: 0 };
    entry.revenue += revenue;
    entry.cost += cost;
    map.set(category, entry);
  };
  businesses.forEach((line) => add(line.category, line.actualAmount, 0));
  costs.forEach((line) => add(line.category, 0, line.actualAmount));
  extraEntries.forEach((entry) =>
    add(entry.category, extraEntryRevenue(entry), extraEntryCost(entry)),
  );
  return Array.from(map.entries())
    .map(([category, { revenue, cost }]) => ({
      category,
      revenue,
      cost,
      grossProfit: revenue - cost,
    }))
    .sort((a, b) => b.grossProfit - a.grossProfit);
};

// aggregateMonthLines の入力
export type AggregateInput = {
  month: string;
  lines: PLMonthLines;
  isTeamLeader: boolean;
  includeTeamBreakdown: boolean;
  teamOrder?: readonly string[];
  labels?: ProfitLossLabelType[];
};

// 明細行（ライブ集計・確定スナップショット共通）から損益計算書を集計する。
// 月未確定（undated）・対象行が当月に存在しない調整（orphanedAdjustments）は
// 取得した行から別途計算するため、ここでは空で返す（呼び出し側で上書きする）。
export const aggregateMonthLines = ({
  month,
  lines,
  isTeamLeader,
  includeTeamBreakdown,
  teamOrder = [],
  labels = [],
}: AggregateInput): PLReportType => {
  const labelIndex = buildLabelIndex(labels);
  // teamleader の場合、全体共通（team IS NULL）の経理追加収支・管理費は損益に算入せず
  // 参考表示に分離する（案件は matters.team が NOT NULL のため常に算入）
  const countedExtraEntries = isTeamLeader
    ? lines.extraEntries.filter((entry) => entry.team !== null)
    : lines.extraEntries;
  const orgWideExtraEntries = isTeamLeader
    ? lines.extraEntries.filter((entry) => entry.team === null)
    : undefined;
  const titledRecurringCosts = lines.recurringCosts.map((line) =>
    titledRecurringCostLine(line, labelIndex),
  );
  const countedRecurringCosts = isTeamLeader
    ? titledRecurringCosts.filter((line) => line.team !== null)
    : titledRecurringCosts;
  const orgWideRecurringCosts = isTeamLeader
    ? titledRecurringCosts.filter((line) => line.team === null)
    : undefined;

  // ===== 案件別収支・分類別収支 =====
  const teamMatterGroups = buildTeamMatterGroups(
    lines.businesses,
    lines.costs,
    countedExtraEntries,
    teamOrder,
    labelIndex,
  );
  const categoryBreakdown = buildCategoryBreakdown(
    lines.businesses,
    lines.costs,
    countedExtraEntries,
  );
  const revenueTotal = teamMatterGroups.reduce(
    (sum, group) => sum + group.revenue,
    0,
  );
  const matterCostTotal = teamMatterGroups.reduce(
    (sum, group) => sum + group.cost,
    0,
  );
  const grossProfitTotal = revenueTotal - matterCostTotal;

  // ===== 管理費（定期費用。費目別。明細は展開表示に使う） =====
  const recurringItemMap = new Map<string, TitledRecurringCostLine[]>();
  countedRecurringCosts.forEach((line) => {
    if (!recurringItemMap.has(line.item)) {
      recurringItemMap.set(line.item, []);
    }
    recurringItemMap.get(line.item)!.push(line);
  });
  const recurringCostByItem: RecurringCostItemBreakdown[] = Array.from(
    recurringItemMap.entries(),
  )
    .map(([item, details]) => ({
      item,
      amount: details.reduce((sum, detail) => sum + detail.actualAmount, 0),
      details,
    }))
    .sort((a, b) => b.amount - a.amount);
  const recurringCostTotal = recurringCostByItem.reduce(
    (sum, item) => sum + item.amount,
    0,
  );

  // ===== チーム別内訳（accounting / admin のみ） =====
  let byTeam: TeamBreakdown[] | undefined;
  if (includeTeamBreakdown) {
    const teamMap = new Map<string, TeamBreakdown>();
    const getTeamEntry = (team: string | null): TeamBreakdown => {
      const label = team ?? ORG_WIDE_TEAM_LABEL;
      if (!teamMap.has(label)) {
        teamMap.set(label, {
          team: label,
          revenue: 0,
          matterCost: 0,
          grossProfit: 0,
          recurringCost: 0,
          profit: 0,
        });
      }
      return teamMap.get(label)!;
    };
    // 案件別収支と同じ明細・実績額を使う（本表とチーム別内訳がズレないようにする）
    teamMatterGroups.forEach((group) => {
      const entry = getTeamEntry(group.team);
      entry.revenue += group.revenue;
      entry.matterCost += group.cost;
    });
    lines.recurringCosts.forEach((line) => {
      getTeamEntry(line.team).recurringCost += line.actualAmount;
    });
    byTeam = Array.from(teamMap.values())
      .map((entry) => ({
        ...entry,
        grossProfit: entry.revenue - entry.matterCost,
        profit: entry.revenue - entry.matterCost - entry.recurringCost,
      }))
      .sort((a, b) => b.profit - a.profit);
  }

  return {
    month,
    revenueTotal,
    matterCostTotal,
    grossProfitTotal,
    teamMatterGroups,
    categoryBreakdown,
    recurringCostTotal,
    recurringCostByItem,
    orgWideRecurringCosts,
    extraEntries: countedExtraEntries,
    orgWideExtraEntries,
    ordinaryProfit: grossProfitTotal - recurringCostTotal,
    byTeam,
    undated: { revenue: 0, matterCost: 0 },
    orphanedAdjustments: undefined,
    // ライブ集計（未確定）。確定済みの月は buildMonthReport（profitLossClosing.ts）が上書きする
    closing: null,
  };
};

// 月未確定（案件開始日・日付未入力）の売上・費用。下書きの案件は除く。
// 確定済みの月でも常にライブの値を表示する（Issue #148）
export const computeUndated = (
  businessRows: BusinessRow[],
  costRows: CostRow[],
  extraEntries: ExtraEntryType[],
): PLReportType["undated"] => {
  const isUndatedMatter = (matter: MatterOfRow) =>
    !isDraftMatter(matter) && matter.start_date === null;
  const undatedExtraEntries = extraEntries
    .filter((entry) => entry.entry_date === null)
    .map(toExtraEntryLine);
  return {
    revenue:
      businessRows
        .filter((row) => isUndatedMatter(row.matters))
        .reduce((sum, row) => sum + (row.amount ?? 0), 0) +
      undatedExtraEntries.reduce(
        (sum, entry) => sum + extraEntryRevenue(entry),
        0,
      ),
    matterCost:
      costRows
        .filter((row) => isUndatedMatter(row.matters))
        .reduce((sum, row) => sum + row.price, 0) +
      undatedExtraEntries.reduce(
        (sum, entry) => sum + extraEntryCost(entry),
        0,
      ),
  };
};

// 対象行が当月に存在しない調整（案件開始日の変更等で対象行が別の月に移動した・
// 案件が下書きに戻された）。CASCADE により対象行そのものが削除された調整は存在しなく
// なるため、ここに現れるのは「対象行は存在するが、当月の集計対象からは外れた」ケースのみ。
// lines は当月のライブの明細行（buildLiveMonthLines の結果）。
export const computeOrphanedAdjustments = (
  month: string,
  lines: PLMonthLines,
  adjustments: ProfitLossAdjustmentType[],
  businessRows: BusinessRow[],
  costRows: CostRow[],
  recurringCosts: RecurringCostType[],
  labelIndex: LabelIndex = buildLabelIndex(),
): OrphanedAdjustmentType[] => {
  const monthlyBusinessIds = new Set(
    lines.businesses.map((line) => line.businessId),
  );
  const monthlyCostIds = new Set(lines.costs.map((line) => line.costId));
  const activeRecurringCostIds = new Set(
    lines.recurringCosts.map((line) => line.recurringCostId),
  );

  // 対象行を特定できるラベルを組み立てる。対象行自体は月に関わらず全件
  // （businessRows / costRows / recurringCosts。month でフィルタする前）から探す
  const businessById = new Map(businessRows.map((row) => [row.id, row]));
  const costById = new Map(costRows.map((row) => [row.id, row]));
  const recurringCostById = new Map(recurringCosts.map((rc) => [rc.id, rc]));
  const matterTitleOf = (row: BusinessRow | CostRow) =>
    labelIndex.matter.get(row.matter_id) ?? row.matters.title;

  return adjustments
    .filter((adjustment) => toMonthKey(adjustment.target_month) === month)
    .filter((adjustment) => {
      if (adjustment.business_id !== null) {
        return !monthlyBusinessIds.has(adjustment.business_id);
      }
      if (adjustment.cost_id !== null) {
        return !monthlyCostIds.has(adjustment.cost_id);
      }
      return !activeRecurringCostIds.has(adjustment.recurring_cost_id!);
    })
    .map((adjustment) => {
      if (adjustment.business_id !== null) {
        const row = businessById.get(adjustment.business_id);
        return {
          adjustment,
          targetType: "business" as const,
          label: row
            ? `${matterTitleOf(row)} - ${labelIndex.business.get(row.id) ?? row.name}`
            : `売上（ID: ${adjustment.business_id}）`,
        };
      }
      if (adjustment.cost_id !== null) {
        const row = costById.get(adjustment.cost_id);
        return {
          adjustment,
          targetType: "cost" as const,
          label: row
            ? `${matterTitleOf(row)} - ${labelIndex.cost.get(row.id) ?? row.name}（${row.item}）`
            : `案件費用（ID: ${adjustment.cost_id}）`,
        };
      }
      const rc = recurringCostById.get(adjustment.recurring_cost_id!);
      return {
        adjustment,
        targetType: "recurring_cost" as const,
        label: rc
          ? (labelIndex.recurringCost.get(rc.id) ?? rc.name)
          : `管理費（ID: ${adjustment.recurring_cost_id}）`,
      };
    });
};

// 取得済みの行から指定月の損益レポートを組み立てる（ライブ集計）
export const buildMonthlyReport = (input: MonthlyReportInput): PLReportType => {
  const lines = buildLiveMonthLines(input);
  const report = aggregateMonthLines({
    month: input.month,
    lines,
    isTeamLeader: input.isTeamLeader,
    includeTeamBreakdown: input.includeTeamBreakdown,
    teamOrder: input.teamOrder,
    labels: input.labels,
  });
  return {
    ...report,
    undated: computeUndated(
      input.businessRows,
      input.costRows,
      input.extraEntries,
    ),
    // 削除を促す表示に使うため、実績額修正の操作を持つロール（includeTeamBreakdown =
    // accounting / admin）にのみ含める。年間推移（includeOrphanedAdjustments=false）
    // では表示に使わないため計算しない
    orphanedAdjustments:
      input.includeTeamBreakdown && input.includeOrphanedAdjustments
        ? computeOrphanedAdjustments(
            input.month,
            lines,
            input.adjustments,
            input.businessRows,
            input.costRows,
            input.recurringCosts,
            buildLabelIndex(input.labels),
          )
        : undefined,
  };
};

// 年度（7月〜翌6月）の月キー一覧を生成する
export const fiscalYearMonths = (fiscalYear: number): string[] =>
  Array.from({ length: 12 }, (_, i) => {
    const monthNumber = ((6 + i) % 12) + 1; // 7, 8, ..., 12, 1, ..., 6
    const year = monthNumber >= 7 ? fiscalYear : fiscalYear + 1;
    return `${year}-${String(monthNumber).padStart(2, "0")}`;
  });
