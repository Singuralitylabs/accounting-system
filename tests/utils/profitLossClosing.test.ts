import { describe, expect, it } from "vitest";
import {
  BusinessRow,
  CostRow,
  MonthlyReportInput,
  buildLiveMonthLines,
  buildMonthlyReport,
} from "@/app/utils/profitLossLogic";
import {
  MonthClosingSnapshot,
  buildMonthReport,
  canWriteExtraEntry,
  closedMonthsInRecurringRange,
  closingRowsToMonthLines,
  findExtraEntryLockViolations,
  isClosedMonth,
  monthLinesToClosingRows,
  refreshSnapshotNames,
  toClosedMonthSet,
} from "@/app/utils/profitLossClosing";
import {
  ExtraEntryType,
  ProfitLossAdjustmentType,
  RecurringCostType,
} from "@/app/types/types";

// ===== フィクスチャ =====

const matter = (
  id: number,
  team: string,
  category = "受託案件",
  startDate: string | null = "2026-08-10",
) => ({
  id,
  user_id: 1,
  title: `案件${id}`,
  team,
  category,
  start_date: startDate,
  is_fixed: true,
  is_completed: false,
});

const business = (
  id: number,
  amount: number,
  matterId = 1,
  team = "シンラボ",
  category = "受託案件",
): BusinessRow => ({
  id,
  name: `取引先${id}`,
  amount,
  matter_id: matterId,
  matters: matter(matterId, team, category),
});

const cost = (
  id: number,
  price: number,
  matterId = 1,
  team = "シンラボ",
  category = "受託案件",
): CostRow => ({
  id,
  name: `コスト${id}`,
  price,
  item: "外注費",
  matter_id: matterId,
  matters: matter(matterId, team, category),
});

const recurringCost = (
  override: Partial<RecurringCostType> & Pick<RecurringCostType, "id">,
): RecurringCostType => ({
  name: `定期費用${override.id}`,
  item: "システム料",
  price: 10000,
  team: "シンラボ",
  payment_cycle: "monthly",
  start_month: "2026-07-01",
  end_month: null,
  comment: null,
  inserted_at: "2026-07-01T00:00:00+09:00",
  updated_at: "2026-07-01T00:00:00+09:00",
  ...override,
});

const extraEntry = (
  override: Partial<ExtraEntryType> & Pick<ExtraEntryType, "id">,
): ExtraEntryType => ({
  entry_type: "income",
  category: "協賛金",
  entry_date: "2026-08-10",
  invoice_number: null,
  description: `経理追加${override.id}`,
  billing_target: null,
  manager_id: 1,
  team: null,
  billing_amount: 30000,
  expense_amount: 5000,
  payment_method: null,
  inserted_at: "2026-07-01T00:00:00+09:00",
  updated_at: "2026-07-01T00:00:00+09:00",
  ...override,
});

const adjustment = (
  override: Partial<ProfitLossAdjustmentType> &
    Pick<ProfitLossAdjustmentType, "id">,
): ProfitLossAdjustmentType => ({
  target_month: "2026-08-01",
  business_id: null,
  cost_id: null,
  recurring_cost_id: null,
  adjustment_amount: 1000,
  source_amount_snapshot: 0,
  reason: `調整理由${override.id}`,
  adjusted_by: 1,
  inserted_at: "2026-08-01T00:00:00+09:00",
  updated_at: "2026-08-01T00:00:00+09:00",
  ...override,
});

const baseInput = (
  override: Partial<MonthlyReportInput> = {},
): MonthlyReportInput => ({
  month: "2026-08",
  businessRows: [
    business(1, 100000, 1, "シンラボ"),
    business(2, 200000, 2, "SDGs", "イベント"),
  ],
  costRows: [cost(1, 30000, 1, "シンラボ"), cost(2, 50000, 2, "SDGs")],
  recurringCosts: [
    recurringCost({ id: 1, team: "シンラボ" }),
    recurringCost({ id: 2, team: null, price: 70000, item: "施設利用料" }),
  ],
  extraEntries: [
    extraEntry({ id: 1, team: null }),
    extraEntry({
      id: 2,
      team: "SDGs",
      entry_type: "expense",
      billing_amount: null,
      expense_amount: 8000,
      payment_method: "現金",
    }),
  ],
  adjustments: [
    adjustment({
      id: 1,
      business_id: 1,
      adjustment_amount: -10000,
      source_amount_snapshot: 100000,
    }),
    adjustment({
      id: 2,
      recurring_cost_id: 2,
      adjustment_amount: 5000,
      source_amount_snapshot: 70000,
    }),
  ],
  isTeamLeader: false,
  includeTeamBreakdown: true,
  includeOrphanedAdjustments: true,
  teamOrder: ["シンラボ", "SDGs"],
  ...override,
});

// 確定時点のライブ集計からスナップショット（DB 保存形式）を作る
const snapshotOf = (input: MonthlyReportInput): MonthClosingSnapshot => ({
  header: {
    target_month: `${input.month}-01`,
    closed_at: "2026-09-01T10:00:00+09:00",
    closed_by_name: "経理太郎",
    refreshed_at: null,
    refreshed_by_name: null,
  },
  lines: monthLinesToClosingRows(buildLiveMonthLines(input)),
  dismissals: [],
});

// スナップショットをチームリーダーが読む（RLS: 自チーム＋全体共通の明細のみ）
const visibleToTeamLeader = (
  snapshot: MonthClosingSnapshot,
  team: string,
): MonthClosingSnapshot => ({
  ...snapshot,
  lines: snapshot.lines.filter(
    (line) => line.team === null || line.team === team,
  ),
});

// ===== テスト =====

describe("確定明細への変換と再構成（Issue #148）", () => {
  it("明細行 → 確定明細 → 明細行の往復で内容が一致する（調整額・調整理由を含む）", () => {
    const lines = buildLiveMonthLines(baseInput());
    const restored = closingRowsToMonthLines(monthLinesToClosingRows(lines));
    // 確定値は元データ変更の警告・調整レコードを持たない（金額と理由のみ保持する）
    const normalize = <T extends { adjustment?: unknown }>(items: T[]) =>
      items.map((item) => ({ ...item, adjustment: null }));
    expect(restored.businesses).toEqual(normalize(lines.businesses));
    expect(restored.costs).toEqual(normalize(lines.costs));
    expect(restored.recurringCosts).toEqual(normalize(lines.recurringCosts));
    expect(restored.extraEntries).toEqual(lines.extraEntries);
    expect(restored.businesses[0]).toMatchObject({
      actualAmount: 90000,
      adjustmentAmount: -10000,
      adjustmentReason: "調整理由1",
    });
  });

  it.each([
    ["経理担当者・管理者", false, null],
    ["チームリーダー", true, "シンラボ"],
  ] as const)(
    "%s: 確定直後はスナップショットから組み立てた損益計算書がライブ集計と一致する",
    (_label, isTeamLeader, team) => {
      const input = baseInput({
        isTeamLeader,
        includeTeamBreakdown: !isTeamLeader,
        // チームリーダーは RLS で自チーム＋全体共通の行しか読めない
        ...(team
          ? {
              businessRows: baseInput().businessRows.filter(
                (row) => row.matters.team === team,
              ),
              costRows: baseInput().costRows.filter(
                (row) => row.matters.team === team,
              ),
              recurringCosts: baseInput().recurringCosts.filter(
                (rc) => rc.team === null || rc.team === team,
              ),
              extraEntries: baseInput().extraEntries.filter(
                (entry) => entry.team === null || entry.team === team,
              ),
            }
          : {}),
      });
      const snapshot = snapshotOf(baseInput());
      const live = buildMonthlyReport(input);
      const closed = buildMonthReport({
        ...input,
        closing: team ? visibleToTeamLeader(snapshot, team) : snapshot,
      });
      const strip = (report: typeof live) => ({
        ...report,
        closing: undefined,
        closingDiffs: undefined,
        orphanedAdjustments: undefined,
        teamMatterGroups: report.teamMatterGroups.map((group) => ({
          ...group,
          matters: group.matters.map((m) => ({
            ...m,
            businesses: m.businesses.map((b) => ({ ...b, adjustment: null })),
            costs: m.costs.map((c) => ({ ...c, adjustment: null })),
          })),
        })),
        recurringCostByItem: report.recurringCostByItem.map((item) => ({
          ...item,
          details: item.details.map((d) => ({ ...d, adjustment: null })),
        })),
        orgWideRecurringCosts: report.orgWideRecurringCosts?.map((d) => ({
          ...d,
          adjustment: null,
        })),
      });
      expect(strip(closed)).toEqual(strip(live));
      expect(closed.closing).toMatchObject({
        month: "2026-08",
        closedByName: "経理太郎",
      });
      expect(live.closing).toBeNull();
    },
  );

  it("確定後に案件・定期費用・調整が変わっても、削除されても確定済みの月の表示は変わらない", () => {
    const input = baseInput();
    const snapshot = snapshotOf(input);
    const before = buildMonthReport({ ...input, closing: snapshot });
    const changed = baseInput({
      // 案件 1 の売上を増額、案件 2 の明細を削除（調整も CASCADE で削除）、定期費用を値上げ
      businessRows: [business(1, 999999, 1, "シンラボ")],
      costRows: [cost(1, 30000, 1, "シンラボ")],
      recurringCosts: [
        recurringCost({ id: 1, team: "シンラボ", price: 99999 }),
        recurringCost({ id: 2, team: null, price: 70000, item: "施設利用料" }),
      ],
      adjustments: [],
    });
    const after = buildMonthReport({ ...changed, closing: snapshot });
    expect(after.revenueTotal).toBe(before.revenueTotal);
    expect(after.matterCostTotal).toBe(before.matterCostTotal);
    expect(after.recurringCostTotal).toBe(before.recurringCostTotal);
    expect(after.ordinaryProfit).toBe(before.ordinaryProfit);
    expect(after.byTeam).toEqual(before.byTeam);
    // ライブ集計は変わっている（確定値との差分は Issue #149 で検知する）
    expect(buildMonthlyReport(changed).revenueTotal).not.toBe(
      before.revenueTotal,
    );
  });

  it("年間推移: 確定済みの月はスナップショット、未確定の月はライブ集計を使う", () => {
    const august = baseInput();
    const snapshot = snapshotOf(august);
    // 確定後、両月とも定期費用が値上げされた
    const rows = baseInput({
      recurringCosts: [
        recurringCost({ id: 1, team: "シンラボ", price: 20000 }),
        recurringCost({ id: 2, team: null, price: 70000, item: "施設利用料" }),
      ],
    });
    const closedAugust = buildMonthReport({
      ...rows,
      month: "2026-08",
      closing: snapshot,
    });
    const liveSeptember = buildMonthReport({
      ...rows,
      month: "2026-09",
      closing: null,
    });
    expect(closedAugust.recurringCostTotal).toBe(85000); // 確定時点（10000 + 70000 + 調整 5000）
    expect(liveSeptember.recurringCostTotal).toBe(90000); // 値上げ後（20000 + 70000）
    expect(closedAugust.closing).not.toBeNull();
    expect(liveSeptember.closing).toBeNull();
  });

  it("月未確定の注記は確定済みの月でもライブの値を表示する", () => {
    const input = baseInput();
    const snapshot = snapshotOf(input);
    const withUndated = baseInput({
      businessRows: [
        ...input.businessRows,
        {
          ...business(9, 12345, 9, "シンラボ"),
          matters: matter(9, "シンラボ", "受託案件", null),
        },
      ],
    });
    const report = buildMonthReport({ ...withUndated, closing: snapshot });
    expect(report.undated.revenue).toBe(12345);
  });

  it("確定済みの月の名称は最新の元データに差し替え、元の行が無ければ確定時点の名称を使う", () => {
    const lines = closingRowsToMonthLines(
      monthLinesToClosingRows(buildLiveMonthLines(baseInput())),
    );
    const renamed = refreshSnapshotNames(lines, {
      businessRows: [
        {
          ...business(1, 100000, 1, "シンラボ"),
          name: "取引先1（改名）",
          matters: { ...matter(1, "シンラボ"), title: "案件1（改名）" },
        },
      ],
      costRows: [],
      recurringCosts: [],
    });
    expect(renamed.businesses[0]).toMatchObject({
      name: "取引先1（改名）",
      matterTitle: "案件1（改名）",
      actualAmount: 90000, // 金額は確定値のまま
    });
    // 同じ案件の費用明細にも最新の案件名を使う
    expect(renamed.costs[0].matterTitle).toBe("案件1（改名）");
    // 元の行が取得範囲に無い明細は確定時点の名称
    expect(renamed.businesses[1].name).toBe("取引先2");
    expect(renamed.costs[1].matterTitle).toBe("案件2");
  });
});

describe("確定済みの月の判定と編集可否（Issue #148）", () => {
  const closed = toClosedMonthSet([
    { target_month: "2026-08-01" },
    { target_month: "2026-10-01" },
  ]);

  it("日付・月キーの月が確定済みか判定する（NULL は対象外）", () => {
    expect(isClosedMonth(closed, "2026-08-31")).toBe(true);
    expect(isClosedMonth(closed, "2026-08")).toBe(true);
    expect(isClosedMonth(closed, "2026-09-01")).toBe(false);
    expect(isClosedMonth(closed, null)).toBe(false);
    expect(isClosedMonth(closed, undefined)).toBe(false);
  });

  it("経理追加収支は変更前・変更後のどちらかが確定済みの月なら保存できない", () => {
    expect(canWriteExtraEntry(closed, "2026-09-10", "2026-09-20")).toBe(true);
    expect(canWriteExtraEntry(closed, undefined, "2026-09-20")).toBe(true);
    expect(canWriteExtraEntry(closed, null, null)).toBe(true);
    expect(canWriteExtraEntry(closed, "2026-08-10", "2026-08-10")).toBe(false);
    expect(canWriteExtraEntry(closed, "2026-09-10", "2026-08-10")).toBe(false); // 確定済みの月へ移動
    expect(canWriteExtraEntry(closed, "2026-08-10", "2026-09-10")).toBe(false); // 確定済みの月から移動
    expect(canWriteExtraEntry(closed, "2026-08-10", null)).toBe(false);
    expect(canWriteExtraEntry(closed, undefined, "2026-10-01")).toBe(false); // 確定済みの月への追加
  });

  it("一括保存の対象から編集ロックに抵触する行を抽出する（編集していない行は対象外）", () => {
    const saved = (id: number, entryDate: string | null, description: string) =>
      extraEntry({ id, entry_date: entryDate, description });
    const originals = new Map(
      [
        saved(1, "2026-08-10", "確定月の更新"),
        saved(2, "2026-09-10", "未確定月の更新"),
        saved(3, "2026-09-10", "確定月へ移動"),
        saved(4, "2026-08-10", "確定月の削除"),
        saved(8, "2026-08-20", "確定月の未変更行"),
      ].map((entry) => [entry.id, entry]),
    );
    const row = (
      entry: ExtraEntryType,
      flags: { isNew?: boolean; isRemoved?: boolean } = {},
    ) => ({ ...entry, isNew: false, isRemoved: false, ...flags });
    const violations = findExtraEntryLockViolations(
      [
        row({ ...originals.get(1)!, billing_amount: 99999 }),
        row({ ...originals.get(2)!, entry_date: "2026-09-15" }),
        row({ ...originals.get(3)!, entry_date: "2026-10-15" }),
        row(originals.get(4)!, { isRemoved: true }),
        // 画面は全行を送る。確定済みの月の行でも編集していなければ違反にしない
        row(originals.get(8)!),
        row(saved(5, "2026-08-01", "確定月に追加"), { isNew: true }),
        row(saved(6, "2026-08-01", "追加して取り消し"), {
          isNew: true,
          isRemoved: true,
        }),
        row(saved(7, null, ""), { isNew: true }),
      ],
      originals,
      closed,
    );
    expect(violations).toEqual([
      "確定月の更新",
      "確定月へ移動",
      "確定月の削除",
      "確定月に追加",
    ]);
  });

  it("定期費用の適用期間に含まれる確定済みの月を昇順で返す", () => {
    expect(
      closedMonthsInRecurringRange(
        { start_month: "2026-07-01", end_month: null },
        closed,
      ),
    ).toEqual(["2026-08", "2026-10"]);
    expect(
      closedMonthsInRecurringRange(
        { start_month: "2026-09-01", end_month: "2026-09-01" },
        closed,
      ),
    ).toEqual([]);
    expect(
      closedMonthsInRecurringRange(
        { start_month: "2026-08-01", end_month: "2026-09-01" },
        closed,
      ),
    ).toEqual(["2026-08"]);
  });
});
