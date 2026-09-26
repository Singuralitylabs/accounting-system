import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BusinessRow, CostRow } from "@/app/utils/profitLossLogic";
import type { ReportSourceRows } from "@/app/utils/supabase/profitLossSource";

const {
  createServerSupabase,
  getAuthorizedViewer,
  fetchReportSourceRows,
  fetchLiveSourceRows,
  fetchClosingSourceRows,
  getClosedMonths,
} = vi.hoisted(() => ({
  createServerSupabase: vi.fn(),
  getAuthorizedViewer: vi.fn(),
  fetchReportSourceRows: vi.fn(),
  fetchLiveSourceRows: vi.fn(),
  fetchClosingSourceRows: vi.fn(),
  getClosedMonths: vi.fn(),
}));

vi.mock("@/app/utils/supabase/clients", () => ({ createServerSupabase }));
vi.mock("@/app/utils/supabase/viewerAccess", () => ({ getAuthorizedViewer }));
vi.mock("@/app/utils/supabase/profitLossSource", () => ({
  fetchReportSourceRows,
  fetchLiveSourceRows,
  fetchClosingSourceRows,
}));
vi.mock("@/app/utils/supabase/profitLossClosedMonths", () => ({
  getClosedMonths,
}));

import {
  applyClosingDiffs,
  closeProfitLossMonth,
  dismissClosingDiffs,
  getClosingDiffSummary,
  reopenProfitLossMonth,
} from "@/app/utils/supabase/profitLossClosings";

const matter = (id: number) => ({
  id,
  user_id: 5,
  title: `案件${id}`,
  team: "シンラボ",
  category: "受託案件",
  start_date: "2026-08-10",
  is_fixed: true,
  is_completed: false,
});
const business = (id: number, amount: number): BusinessRow => ({
  id,
  name: `取引先${id}`,
  amount,
  matter_id: 1,
  matters: matter(1),
});
const cost = (id: number, price: number): CostRow => ({
  id,
  name: `コスト${id}`,
  price,
  item: "外注費",
  matter_id: 1,
  matters: matter(1),
});

const rows = (
  override: Partial<ReportSourceRows> = {},
  closed = true,
): ReportSourceRows => ({
  teamOrder: [],
  businessRows: [business(1, 120000)],
  costRows: [cost(1, 30000)],
  recurringCosts: [],
  extraEntries: [],
  adjustments: [],
  labels: [],
  closings: closed
    ? new Map([
        [
          "2026-08",
          {
            header: {
              id: 1,
              target_month: "2026-08-01",
              closed_at: "",
              closed_by: 1,
              closed_by_name: "経理太郎",
              refreshed_at: null,
              refreshed_by: null,
              refreshed_by_name: null,
              inserted_at: "",
              updated_at: "",
            },
            lines: [],
            dismissals: [],
          },
        ],
      ])
    : new Map(),
  ...override,
});

const rpc = vi.fn();

// 画面で見ていた明細の状態（反映・見送りで送る）
const present = (actualAmount: number) => ({
  present: true,
  actualAmount,
  team: "シンラボ",
  category: "受託案件",
});
const absent = {
  present: false,
  actualAmount: null,
  team: null,
  category: null,
};

describe("profitLossClosings の Server Action（Issue #148 / #149）", () => {
  beforeEach(() => {
    rpc.mockReset().mockResolvedValue({ data: [{ id: 7 }], error: null });
    createServerSupabase.mockReset().mockReturnValue({ rpc });
    getAuthorizedViewer.mockReset().mockResolvedValue({
      profileInfo: { id: 1, class: "accounting", team: null },
    });
    fetchReportSourceRows.mockReset().mockResolvedValue(rows());
    // 確定はライブ集計の行だけを取得する（テストでは同じ行を返す）
    fetchLiveSourceRows
      .mockReset()
      .mockImplementation((period) => fetchReportSourceRows(period));
    // 差分の集計・反映・見送りはライブの行と確定スナップショットだけを取得する
    fetchClosingSourceRows
      .mockReset()
      .mockImplementation((period) => fetchReportSourceRows(period));
    getClosedMonths.mockReset().mockResolvedValue({ months: [] });
  });

  it("反映はクライアントから受け取ったキーだけを対象に、サーバで集計し直した値で upsert / delete を組み立てる", async () => {
    const result = await applyClosingDiffs("2026-08", [
      // ライブにある → 最新値で upsert
      { sourceType: "business", sourceId: 1, expected: present(120000) },
      // ライブに無い → delete
      { sourceType: "business", sourceId: 2, expected: absent },
    ]);
    expect(result).toEqual({});
    expect(rpc).toHaveBeenCalledTimes(1);
    const [name, args] = rpc.mock.calls[0];
    expect(name).toBe("apply_profit_loss_closing_diffs");
    expect(args.p_target_month).toBe("2026-08-01");
    expect(args.p_upsert_lines).toEqual([
      expect.objectContaining({
        source_type: "business",
        source_id: 1,
        actual_amount: 120000,
        matter_user_id: 5,
      }),
    ]);
    // 選ばなかった費用明細（cost:1）は含めない
    expect(args.p_delete_keys).toEqual([
      { source_type: "business", source_id: 2 },
    ]);
  });

  it("見送りはサーバで集計し直したその時点のライブの状態を記録する", async () => {
    await dismissClosingDiffs("2026-08", [
      { sourceType: "cost", sourceId: 1, expected: present(30000) },
      { sourceType: "cost", sourceId: 9, expected: absent },
    ]);
    const [name, args] = rpc.mock.calls[0];
    expect(name).toBe("dismiss_profit_loss_closing_diffs");
    expect(args.p_dismissals).toEqual([
      {
        source_type: "cost",
        source_id: 1,
        live_present: true,
        live_actual_amount: 30000,
        live_team: "シンラボ",
        live_category: "受託案件",
      },
      {
        source_type: "cost",
        source_id: 9,
        live_present: false,
        live_actual_amount: null,
        live_team: null,
        live_category: null,
      },
    ]);
  });

  it("不正なキー・未確定の月・権限不足は DB へ書き込まない", async () => {
    expect(
      (
        await applyClosingDiffs("2026-08", [
          {
            sourceType: "recurring_cost" as "cost",
            sourceId: 1,
            expected: absent,
          },
        ])
      ).error?.kind,
    ).toBe("validationFailed");
    fetchReportSourceRows.mockResolvedValue(rows({}, false));
    expect(
      (
        await applyClosingDiffs("2026-08", [
          { sourceType: "cost", sourceId: 1, expected: present(30000) },
        ])
      ).error?.kind,
    ).toBe("validationFailed");
    getAuthorizedViewer.mockResolvedValue({
      error: { kind: "forbidden", message: "権限がありません" },
    });
    expect(
      (
        await dismissClosingDiffs("2026-08", [
          { sourceType: "cost", sourceId: 1, expected: present(30000) },
        ])
      ).error?.kind,
    ).toBe("forbidden");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("画面で見ていた状態から表示後にさらに変更された明細があれば、反映・見送りを拒否する", async () => {
    // 画面では 110,000 だったが、現在は 120,000
    const applied = await applyClosingDiffs("2026-08", [
      { sourceType: "business", sourceId: 1, expected: present(110000) },
    ]);
    expect(applied.error?.kind).toBe("validationFailed");
    expect(applied.error?.message).toContain("再読み込み");
    // 画面では削除（ライブに無い）だったが、現在はライブにある
    const dismissed = await dismissClosingDiffs("2026-08", [
      { sourceType: "cost", sourceId: 1, expected: absent },
    ]);
    expect(dismissed.error?.kind).toBe("validationFailed");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("確定後に集計し直し、確定中の変更があればスナップショットを取り直す", async () => {
    fetchReportSourceRows
      .mockResolvedValueOnce(rows({}, false))
      // 確定の保存と再検証の間に経理追加収支が追加された
      .mockResolvedValueOnce(
        rows(
          {
            extraEntries: [
              {
                id: 3,
                entry_type: "income",
                category: "協賛金",
                entry_date: "2026-08-20",
                invoice_number: null,
                description: "滑り込み",
                billing_target: null,
                manager_id: 1,
                team: null,
                billing_amount: 1000,
                expense_amount: null,
                payment_method: null,
                inserted_at: "",
                updated_at: "",
              },
            ],
          },
          true,
        ),
      );
    expect(await closeProfitLossMonth("2026-08")).toEqual({});
    expect(rpc).toHaveBeenCalledTimes(2);
    // 1 回目は新規の確定（p_closing_id なし）、2 回目は自分の確定（id 7）の取り直し
    expect(rpc.mock.calls[0][1]).not.toHaveProperty("p_closing_id");
    expect(rpc.mock.calls[1][1].p_closing_id).toBe(7);
    const secondLines = rpc.mock.calls[1][1].p_lines;
    expect(
      secondLines.map((line: { source_type: string }) => line.source_type),
    ).toContain("extra_entry");
  });

  it("既に確定済みの月（古い画面からの確定）は上書きせずに再読み込みを促す", async () => {
    rpc.mockResolvedValueOnce({
      data: null,
      error: { message: "ALREADY_CLOSED", code: "P0001", details: "", hint: "" },
    });
    const result = await closeProfitLossMonth("2026-08");
    expect(result.error?.kind).toBe("validationFailed");
    expect(result.error?.message).toContain("再読み込み");
    // 確定済みの月には取り直し（2 回目の保存）もしない
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(fetchReportSourceRows).toHaveBeenCalledTimes(1);
  });

  it("確定直後に他の経理担当者が解除・確定し直していたら取り直さずに知らせる", async () => {
    fetchReportSourceRows
      .mockResolvedValueOnce(rows({}, false))
      // 確定の保存と再検証の間に経理追加収支が追加された（取り直しが必要）
      .mockResolvedValueOnce(
        rows(
          {
            extraEntries: [
              {
                id: 3,
                entry_type: "income",
                category: "協賛金",
                entry_date: "2026-08-20",
                invoice_number: null,
                description: "滑り込み",
                billing_target: null,
                manager_id: 1,
                team: null,
                billing_amount: 1000,
                expense_amount: null,
                payment_method: null,
                inserted_at: "",
                updated_at: "",
              },
            ],
          },
          true,
        ),
      );
    rpc
      .mockResolvedValueOnce({ data: [{ id: 7 }], error: null })
      .mockResolvedValueOnce({
        data: null,
        error: {
          message: "CLOSING_CHANGED",
          code: "P0001",
          details: "",
          hint: "",
        },
      });
    const result = await closeProfitLossMonth("2026-08");
    expect(result.error?.kind).toBe("validationFailed");
    expect(result.error?.message).toContain("再読み込み");
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it("確定後の再集計で変化が無ければ保存は 1 回だけ", async () => {
    expect(await closeProfitLossMonth("2026-08")).toEqual({});
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc.mock.calls[0][0]).toBe("save_profit_loss_closing");
    // 確定はライブ集計の行だけを取得する（確定前と確定直後の 2 回）
    expect(fetchLiveSourceRows).toHaveBeenCalledTimes(2);
  });

  it("確定解除で何も削除されなければ（既に解除済み・RLS で拒否）成功扱いにしない", async () => {
    const deleteResult = (data: { id: number }[]) => ({
      from: () => ({
        delete: () => ({
          eq: () => ({
            select: () => Promise.resolve({ data, error: null }),
          }),
        }),
      }),
    });
    createServerSupabase.mockReturnValue(deleteResult([]));
    const rejected = await reopenProfitLossMonth("2026-08");
    expect(rejected.error?.kind).toBe("validationFailed");
    expect(rejected.error?.message).toContain("再読み込み");
    createServerSupabase.mockReturnValue(deleteResult([{ id: 1 }]));
    expect(await reopenProfitLossMonth("2026-08")).toEqual({});
  });

  it("未反映件数は連続する確定済みの月ごとに取得する（離れた月の間は取得しない）", async () => {
    getClosedMonths.mockResolvedValue({
      months: ["2026-07", "2026-08", "2027-06"],
    });
    const summary = await getClosingDiffSummary();
    expect(summary.error).toBeUndefined();
    expect(fetchClosingSourceRows.mock.calls.map((call) => call[0])).toEqual([
      { startMonth: "2026-07", endMonth: "2026-08" },
      { startMonth: "2027-06", endMonth: "2027-06" },
    ]);
  });
});
