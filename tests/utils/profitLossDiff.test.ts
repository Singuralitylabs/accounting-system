import { describe, expect, it } from "vitest";
import {
  BusinessRow,
  CostRow,
  buildLabelIndex,
  buildLiveMonthLines,
} from "@/app/utils/profitLossLogic";
import {
  closedMonthsForMatter,
  monthLinesToClosingRows,
} from "@/app/utils/profitLossClosing";
import {
  annotateDiffMoves,
  buildApplyPayload,
  computeDiffImpact,
  diffClosingLines,
  diffKindLabel,
  liveDiffStates,
  sanitizeDiffKeys,
} from "@/app/utils/profitLossDiff";
import {
  ClosingLineInput,
  ProfitLossClosingDismissalType,
  RecurringCostType,
} from "@/app/types/types";

// ===== フィクスチャ =====

type MatterOverride = Partial<BusinessRow["matters"]>;

const matter = (id: number, override: MatterOverride = {}) => ({
  id,
  user_id: 1,
  title: `案件${id}`,
  team: "シンラボ",
  category: "受託案件",
  start_date: "2026-08-10",
  is_fixed: true,
  is_completed: false,
  ...override,
});

const business = (
  id: number,
  amount: number,
  matterId = 1,
  override: MatterOverride = {},
): BusinessRow => ({
  id,
  name: `取引先${id}`,
  amount,
  matter_id: matterId,
  matters: matter(matterId, override),
});

const cost = (
  id: number,
  price: number,
  matterId = 1,
  override: MatterOverride = {},
): CostRow => ({
  id,
  name: `コスト${id}`,
  price,
  item: "外注費",
  matter_id: matterId,
  matters: matter(matterId, override),
});

const recurring: RecurringCostType = {
  id: 1,
  name: "家賃",
  item: "施設利用料",
  price: 100000,
  team: null,
  payment_cycle: "monthly",
  start_month: "2026-01-01",
  end_month: null,
  comment: null,
  inserted_at: "2026-01-01T00:00:00+09:00",
  updated_at: "2026-01-01T00:00:00+09:00",
};

const linesOf = (
  month: string,
  businessRows: BusinessRow[],
  costRows: CostRow[],
  recurringCosts: RecurringCostType[] = [],
) =>
  buildLiveMonthLines({
    month,
    businessRows,
    costRows,
    recurringCosts,
    extraEntries: [],
    adjustments: [],
  });

// 確定時点（8 月）: 案件 1 の売上 100,000・費用 30,000、案件 2 の売上 50,000、定期費用 1
const closedBusinesses = [business(1, 100000, 1), business(2, 50000, 2)];
const closedCosts = [cost(1, 30000, 1)];
const closedLines: ClosingLineInput[] = monthLinesToClosingRows(
  linesOf("2026-08", closedBusinesses, closedCosts, [recurring]),
);

const dismissal = (
  override: Partial<ProfitLossClosingDismissalType> &
    Pick<ProfitLossClosingDismissalType, "source_type" | "source_id">,
): ProfitLossClosingDismissalType => ({
  id: 1,
  closing_id: 1,
  live_present: true,
  live_actual_amount: null,
  live_team: null,
  live_category: null,
  dismissed_by: 1,
  dismissed_by_name: "経理太郎",
  dismissed_at: "2026-09-02T10:00:00+09:00",
  ...override,
});

const diff = (
  businessRows: BusinessRow[],
  costRows: CostRow[],
  dismissals: ProfitLossClosingDismissalType[] = [],
  recurringCosts: RecurringCostType[] = [recurring],
) =>
  diffClosingLines({
    liveLines: linesOf("2026-08", businessRows, costRows, recurringCosts),
    closedLines,
    dismissals,
  });

// ===== テスト =====

describe("diffClosingLines（Issue #149）", () => {
  it("確定後に変更が無ければ差分なし（定期費用の変更・名称だけの変更も差分にしない）", () => {
    const renamed = [
      { ...business(1, 100000, 1), name: "取引先1（改名）" },
      {
        ...business(2, 50000, 2),
        matters: { ...matter(2), title: "案件2（改名）" },
      },
    ];
    const result = diff(
      renamed,
      closedCosts,
      [],
      [
        { ...recurring, price: 999999 }, // 定期費用マスタの変更は検知の対象外
      ],
    );
    expect(result).toEqual({ pending: [], dismissed: [] });
  });

  it("追加・削除・金額変更・区分変更を検知する", () => {
    const result = diff(
      [
        business(1, 120000, 1), // 金額変更
        // 案件 2 は削除（明細なし）
        business(3, 70000, 3), // 追加（確定後に経理申請された案件）
      ],
      [cost(1, 30000, 1, { team: "SDGs", category: "イベント" })], // 区分変更
    );
    expect(
      result.pending.map((d) => ({
        key: d.key,
        kind: d.kind,
        label: diffKindLabel(d),
        delta: d.delta,
      })),
    ).toEqual([
      { key: "business:1", kind: "changed", label: "金額変更", delta: 20000 },
      { key: "cost:1", kind: "changed", label: "区分変更", delta: 0 },
      { key: "business:2", kind: "removed", label: "削除", delta: -50000 },
      { key: "business:3", kind: "added", label: "追加", delta: 70000 },
    ]);
    const classification = result.pending.find((d) => d.key === "cost:1")!;
    expect(classification.before).toEqual({
      actualAmount: 30000,
      team: "シンラボ",
      category: "受託案件",
    });
    expect(classification.after).toEqual({
      actualAmount: 30000,
      team: "SDGs",
      category: "イベント",
    });
  });

  it("案件が下書きに戻されると明細は削除の差分になる", () => {
    const result = diff(
      [business(1, 100000, 1, { is_fixed: false }), business(2, 50000, 2)],
      [cost(1, 30000, 1, { is_fixed: false })],
    );
    expect(result.pending.map((d) => [d.key, d.kind])).toEqual([
      ["business:1", "removed"],
      ["cost:1", "removed"],
    ]);
  });

  it("差分の名称は上書きタイトル → 最新の名称 → 確定時点の名称の順で解決する", () => {
    const result = diffClosingLines({
      liveLines: linesOf("2026-08", [business(1, 1, 1)], closedCosts),
      closedLines,
      dismissals: [],
      labelIndex: buildLabelIndex([
        {
          matter_id: 1,
          business_id: null,
          cost_id: null,
          recurring_cost_id: null,
          label: "経理用案件名",
        },
      ]),
    });
    const changed = result.pending.find((d) => d.key === "business:1")!;
    expect(changed.matterTitle).toBe("経理用案件名");
    const removed = result.pending.find((d) => d.key === "business:2")!;
    expect(removed.name).toBe("取引先2"); // 確定時点の名称
  });

  describe("見送り", () => {
    const changedLive = () => [business(1, 120000, 1), business(2, 50000, 2)];

    it("見送った時点から変化していなければ見送り済みに分ける", () => {
      const result = diff(changedLive(), closedCosts, [
        dismissal({
          source_type: "business",
          source_id: 1,
          live_actual_amount: 120000,
          live_team: "シンラボ",
          live_category: "受託案件",
        }),
      ]);
      expect(result.pending).toEqual([]);
      expect(result.dismissed.map((d) => d.key)).toEqual(["business:1"]);
      expect(result.dismissed[0].dismissal).toEqual({
        dismissedAt: "2026-09-02T10:00:00+09:00",
        dismissedByName: "経理太郎",
      });
    });

    it("見送った後にさらに変更されたら未処理に戻る", () => {
      const result = diff(changedLive(), closedCosts, [
        dismissal({
          source_type: "business",
          source_id: 1,
          live_actual_amount: 110000, // 見送った時点は 110,000
          live_team: "シンラボ",
          live_category: "受託案件",
        }),
      ]);
      expect(result.pending.map((d) => d.key)).toEqual(["business:1"]);
      expect(result.dismissed).toEqual([]);
    });

    it("削除の差分の見送り: 明細が再び現れたら未処理に戻る", () => {
      const removedDismissal = dismissal({
        source_type: "business",
        source_id: 2,
        live_present: false,
      });
      const stillRemoved = diff([business(1, 100000, 1)], closedCosts, [
        removedDismissal,
      ]);
      expect(stillRemoved.dismissed.map((d) => d.key)).toEqual(["business:2"]);
      const reappeared = diff(
        [business(1, 100000, 1), business(2, 60000, 2)],
        closedCosts,
        [removedDismissal],
      );
      expect(reappeared.pending.map((d) => d.key)).toEqual(["business:2"]);
    });

    it("元データが確定値に戻ったら差分でなくなり、見送り記録は表示しない", () => {
      const result = diff(closedBusinesses, closedCosts, [
        dismissal({
          source_type: "business",
          source_id: 1,
          live_actual_amount: 120000,
          live_team: "シンラボ",
          live_category: "受託案件",
        }),
      ]);
      expect(result).toEqual({ pending: [], dismissed: [] });
    });
  });

  it("案件開始日の変更で確定済みの月 A → B に移ると、A は削除・B は追加として相手側の月を併記する", () => {
    // 案件 2 の開始日を 8 月 → 9 月へ変更
    const moved = business(2, 50000, 2, { start_date: "2026-09-05" });
    const augustResult = annotateDiffMoves(
      diff([business(1, 100000, 1), moved], closedCosts),
      {
        liveLocations: new Map([
          ["business:2", { month: "2026-09", isDraft: false }],
        ]),
        otherClosedMonths: new Map(),
        closedMonths: new Set(["2026-08", "2026-09"]),
      },
    );
    expect(augustResult.pending).toMatchObject([
      {
        key: "business:2",
        kind: "removed",
        removedReason: "moved",
        movedMonth: "2026-09",
        movedMonthClosed: true,
      },
    ]);

    // 9 月（確定済み・案件 2 を含まない確定明細）側は追加の差分
    const septemberResult = annotateDiffMoves(
      diffClosingLines({
        liveLines: linesOf("2026-09", [moved], []),
        closedLines: [],
        dismissals: [],
      }),
      {
        liveLocations: new Map(),
        otherClosedMonths: new Map([["business:2", ["2026-08"]]]),
        closedMonths: new Set(["2026-08", "2026-09"]),
      },
    );
    expect(septemberResult.pending).toMatchObject([
      {
        key: "business:2",
        kind: "added",
        movedMonth: "2026-08",
        movedMonthClosed: true,
      },
    ]);
  });

  it("削除の理由（下書きに戻された / 削除された / 開始日が未入力）を付ける", () => {
    const result = annotateDiffMoves(
      diff([], []), // 確定明細の案件の売上・費用がすべてライブから消えた
      {
        liveLocations: new Map([
          ["business:1", { month: "2026-08", isDraft: true }],
          ["cost:1", { month: null, isDraft: false }],
        ]),
        otherClosedMonths: new Map(),
        closedMonths: new Set(["2026-08"]),
      },
    );
    expect(
      result.pending.map((d) => [d.key, d.removedReason, d.movedMonth]),
    ).toEqual([
      ["business:1", "draft", null],
      ["cost:1", "undated", null],
      ["business:2", "deleted", null],
    ]);
  });
});

describe("反映・見送りの入力（Issue #149）", () => {
  const live = linesOf(
    "2026-08",
    [business(1, 120000, 1), business(3, 70000, 3)],
    [cost(1, 30000, 1)],
  );

  it("選択した明細のうち、ライブにあるものは最新の値で upsert、無いものは delete する", () => {
    const payload = buildApplyPayload(live, [
      { sourceType: "business", sourceId: 1 },
      { sourceType: "business", sourceId: 2 }, // ライブに無い（削除）
      { sourceType: "business", sourceId: 3 },
    ]);
    expect(payload.upsertLines.businesses.map((l) => l.businessId)).toEqual([
      1, 3,
    ]);
    expect(payload.upsertLines.costs).toEqual([]); // 選ばなかった明細は含めない
    expect(payload.upsertLines.recurringCosts).toEqual([]);
    expect(payload.deleteKeys).toEqual([
      { source_type: "business", source_id: 2 },
    ]);
  });

  it("見送りにはその時点のライブの状態を記録する", () => {
    expect(
      liveDiffStates(live, [
        { sourceType: "business", sourceId: 1 },
        { sourceType: "business", sourceId: 2 },
      ]),
    ).toEqual([
      {
        sourceType: "business",
        sourceId: 1,
        present: true,
        actualAmount: 120000,
        team: "シンラボ",
        category: "受託案件",
      },
      {
        sourceType: "business",
        sourceId: 2,
        present: false,
        actualAmount: null,
        team: null,
        category: null,
      },
    ]);
  });

  it("選択した差分の影響額（確定値 → 反映後）を算出する", () => {
    const result = diff(
      [business(1, 120000, 1), business(2, 50000, 2)],
      [cost(1, 45000, 1)],
    );
    const impact = computeDiffImpact(
      {
        revenueTotal: 150000,
        matterCostTotal: 30000,
        grossProfitTotal: 120000,
        ordinaryProfit: 20000,
      },
      result.pending,
    );
    expect(impact).toEqual({
      revenue: { before: 150000, after: 170000 },
      matterCost: { before: 30000, after: 45000 },
      grossProfit: { before: 120000, after: 125000 },
      ordinaryProfit: { before: 20000, after: 25000 },
    });
  });

  it("Server Action に渡すキーを検証し重複を除く（不正な値があれば null）", () => {
    expect(
      sanitizeDiffKeys([
        { sourceType: "business", sourceId: 1 },
        { sourceType: "business", sourceId: 1 },
        { sourceType: "cost", sourceId: 2 },
      ]),
    ).toEqual([
      { sourceType: "business", sourceId: 1 },
      { sourceType: "cost", sourceId: 2 },
    ]);
    expect(sanitizeDiffKeys([])).toBeNull();
    expect(
      sanitizeDiffKeys([{ sourceType: "recurring_cost", sourceId: 1 }]),
    ).toBeNull();
    expect(
      sanitizeDiffKeys([{ sourceType: "cost", sourceId: 1.5 }]),
    ).toBeNull();
    expect(sanitizeDiffKeys("business:1")).toBeNull();
  });
});

describe("案件詳細モーダルの確定済みの月の注意表示（Issue #149）", () => {
  const closed = new Set(["2026-08", "2026-10"]);

  it("保存済み・入力中の開始日のどちらかが確定済みの月なら、その月を返す", () => {
    expect(closedMonthsForMatter(closed, ["2026-08-10", "2026-09-01"])).toEqual(
      ["2026-08"],
    );
    expect(closedMonthsForMatter(closed, ["2026-09-01", "2026-10-31"])).toEqual(
      ["2026-10"],
    );
    expect(closedMonthsForMatter(closed, [null, "2026-08-01"])).toEqual([
      "2026-08",
    ]);
    expect(closedMonthsForMatter(closed, ["2026-08-01", "2026-08-20"])).toEqual(
      ["2026-08"],
    );
    expect(closedMonthsForMatter(closed, [null, undefined])).toEqual([]);
  });
});
