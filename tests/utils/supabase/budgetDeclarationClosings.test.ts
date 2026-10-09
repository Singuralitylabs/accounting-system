import { beforeEach, describe, expect, it, vi } from "vitest";

const { createServerSupabase, getAuthorizedViewer, getLoggedInViewer } =
  vi.hoisted(() => ({
    createServerSupabase: vi.fn(),
    getAuthorizedViewer: vi.fn(),
    getLoggedInViewer: vi.fn(),
  }));

vi.mock("@/app/utils/supabase/clients", () => ({ createServerSupabase }));
vi.mock("@/app/utils/supabase/viewerAccess", () => ({
  getAuthorizedViewer,
  getLoggedInViewer,
}));

import {
  closeBudgetDeclarationMonth,
  getBudgetDeclarationClosings,
  reopenBudgetDeclarationMonth,
} from "@/app/utils/supabase/budgetDeclarationClosings";
import { BUDGET_CLOSING_WRITE_CLASSES } from "@/app/utils/permissions";

const forbidden = (message: string) => ({
  error: { kind: "forbidden", message },
});

describe("closeBudgetDeclarationMonth", () => {
  const insert = vi.fn();

  beforeEach(() => {
    insert.mockReset();
    createServerSupabase.mockReturnValue({ from: () => ({ insert }) });
    getAuthorizedViewer.mockReset();
    getAuthorizedViewer.mockResolvedValue({
      profileInfo: { id: 9, name: "経理太郎", class: "accounting" },
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("経理・管理者だけが確定できる権限クラスで認可する", async () => {
    insert.mockResolvedValue({ error: null });

    await closeBudgetDeclarationMonth("2026-10");

    expect(getAuthorizedViewer).toHaveBeenCalledWith(
      BUDGET_CLOSING_WRITE_CLASSES,
      expect.any(String),
      expect.any(String),
    );
    expect(BUDGET_CLOSING_WRITE_CLASSES).toEqual(["accounting", "admin"]);
  });

  it("月初日と確定者の ID で INSERT する（氏名は送らず DB が profiles から採用する）", async () => {
    insert.mockResolvedValue({ error: null });

    expect(await closeBudgetDeclarationMonth("2026-10")).toEqual({});
    expect(insert).toHaveBeenCalledWith({
      target_month: "2026-10-01",
      closed_by: 9,
    });
  });

  it("権限が無ければ INSERT せず、書き込み権限がない旨のエラーを返す（チームリーダーは確定できない）", async () => {
    getAuthorizedViewer.mockResolvedValue(
      forbidden("事前収支申告の月次確定を行う権限がありません。"),
    );

    expect(await closeBudgetDeclarationMonth("2026-10")).toEqual({
      error: {
        kind: "forbidden",
        message: "事前収支申告の月次確定を行う権限がありません。",
      },
    });
    expect(getAuthorizedViewer).toHaveBeenCalledWith(
      BUDGET_CLOSING_WRITE_CLASSES,
      expect.any(String),
      "事前収支申告の月次確定を行う権限がありません。",
    );
    expect(insert).not.toHaveBeenCalled();
  });

  it("月の形式が不正なら INSERT しない", async () => {
    const result = await closeBudgetDeclarationMonth("2026/10");

    expect(result.error?.kind).toBe("validationFailed");
    expect(insert).not.toHaveBeenCalled();
  });

  it("確定済みの月（一意制約違反）は確定済みのメッセージを返す", async () => {
    insert.mockResolvedValue({ error: { code: "23505", message: "dup" } });

    const result = await closeBudgetDeclarationMonth("2026-10");

    expect(result.error?.kind).toBe("validationFailed");
    expect(result.error?.message).toContain("既に確定されています");
  });

  it("その他の DB エラーは fetchFailed を返す", async () => {
    insert.mockResolvedValue({ error: { code: "XX000", message: "boom" } });

    const result = await closeBudgetDeclarationMonth("2026-10");

    expect(result.error?.kind).toBe("fetchFailed");
  });
});

describe("reopenBudgetDeclarationMonth", () => {
  const select = vi.fn();
  const eq = vi.fn(() => ({ select }));
  const del = vi.fn(() => ({ eq }));

  beforeEach(() => {
    select.mockReset();
    eq.mockClear();
    del.mockClear();
    createServerSupabase.mockReturnValue({ from: () => ({ delete: del }) });
    getAuthorizedViewer.mockReset();
    getAuthorizedViewer.mockResolvedValue({
      profileInfo: { id: 9, name: "経理太郎", class: "admin" },
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("対象月の行を削除して解除する", async () => {
    select.mockResolvedValue({ data: [{ id: 1 }], error: null });

    expect(await reopenBudgetDeclarationMonth("2026-10")).toEqual({});
    expect(eq).toHaveBeenCalledWith("target_month", "2026-10-01");
  });

  it("0 行（未確定 / RLS で拒否）は validationFailed を返す", async () => {
    select.mockResolvedValue({ data: [], error: null });

    const result = await reopenBudgetDeclarationMonth("2026-10");

    expect(result.error?.kind).toBe("validationFailed");
  });

  it("権限が無ければ DELETE しない（チームリーダーは解除できない）", async () => {
    getAuthorizedViewer.mockResolvedValue(
      forbidden("事前収支申告の確定解除を行う権限がありません。"),
    );

    expect(await reopenBudgetDeclarationMonth("2026-10")).toEqual({
      error: {
        kind: "forbidden",
        message: "事前収支申告の確定解除を行う権限がありません。",
      },
    });
    expect(del).not.toHaveBeenCalled();
  });
});

describe("getBudgetDeclarationClosings", () => {
  const order = vi.fn();

  beforeEach(() => {
    order.mockReset();
    createServerSupabase.mockReturnValue({
      from: () => ({ select: () => ({ order }) }),
    });
    getLoggedInViewer.mockReset();
    getLoggedInViewer.mockResolvedValue({
      profileInfo: { id: 2, class: "public", is_teamleader: true },
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("確定済みの月を YYYY-MM に変換して返す（チームリーダーも閲覧できる）", async () => {
    order.mockResolvedValue({
      data: [
        {
          target_month: "2026-10-01",
          closed_at: "2026-09-21T01:00:00Z",
          closed_by_name: "経理太郎",
        },
      ],
      error: null,
    });

    expect(await getBudgetDeclarationClosings()).toEqual({
      closings: [
        {
          month: "2026-10",
          closedAt: "2026-09-21T01:00:00Z",
          closedByName: "経理太郎",
        },
      ],
    });
  });

  it("取得に失敗したら fetchFailed を返す", async () => {
    order.mockResolvedValue({ data: null, error: { message: "boom" } });

    const result = await getBudgetDeclarationClosings();

    expect(result.error?.kind).toBe("fetchFailed");
  });
});
