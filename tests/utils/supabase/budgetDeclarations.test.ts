import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createServerSupabase,
  getAuthorizedViewer,
  assertManagerIdsExist,
  getActiveSelectOptionsByType,
} = vi.hoisted(() => ({
  createServerSupabase: vi.fn(),
  getAuthorizedViewer: vi.fn(),
  assertManagerIdsExist: vi.fn(),
  getActiveSelectOptionsByType: vi.fn(),
}));

vi.mock("@/app/utils/supabase/clients", () => ({ createServerSupabase }));
vi.mock("@/app/utils/supabase/viewerAccess", () => ({ getAuthorizedViewer }));
vi.mock("@/app/utils/supabase/profiles", () => ({ assertManagerIdsExist }));
// budgetDeclarations.ts also imports selectOptions.ts for getBudgetDeclarationList, and its dependency
// (selectOptionsCache.ts) calls React's cache() at module evaluation (RSC memoization; only works under
// Next.js builds, not plain Vitest/Node), so mock it to avoid loading the real module.
vi.mock("@/app/utils/supabase/selectOptions", () => ({ getSelectOptions: vi.fn() }));
vi.mock("@/app/utils/supabase/selectOptionsCache", () => ({
  getActiveSelectOptionsByType,
}));

import {
  deleteBudgetDeclaration,
  getBudgetDeclarationList,
  saveBudgetDeclaration,
} from "@/app/utils/supabase/budgetDeclarations";
import { DUPLICATE_DECLARATION_MESSAGE } from "@/app/utils/budgetDeclarationValidation";
import {
  MONTH_CLOSED,
  NO_DATA_FOUND,
  UNIQUE_VIOLATION,
} from "@/app/utils/supabase/errorCodes";
import type { BudgetDeclarationSaveInput } from "@/app/types/types";

const single = vi.fn();
const rpc = vi.fn(() => ({ single }));

const baseInput: BudgetDeclarationSaveInput = {
  declarationId: null,
  targetMonth: "2026-10",
  team: "Aチーム",
  comment: null,
  items: [
    {
      entry_type: " income ",
      category: " セミナー ",
      description: " ○○受託案件 ",
      amount: 100000,
      manager_id: null,
    },
  ],
};

describe("saveBudgetDeclaration", () => {
  beforeEach(() => {
    single.mockReset();
    rpc.mockClear();
    createServerSupabase.mockReturnValue({ rpc });
    getAuthorizedViewer.mockReset();
    getAuthorizedViewer.mockResolvedValue({
      profileInfo: { id: 1, class: "accounting", team: null },
    });
    assertManagerIdsExist.mockReset();
    assertManagerIdsExist.mockResolvedValue(null);
    getActiveSelectOptionsByType.mockReset();
    getActiveSelectOptionsByType.mockResolvedValue({
      optionsByType: {
        category: [{ value: "セミナー" }],
        item: [{ value: "外注費" }],
      },
      error: null,
    });
  });

  it("save_budget_declaration RPC を1回呼ぶだけで完結し、成功時は id を返す", async () => {
    single.mockResolvedValue({ data: { id: 7 }, error: null });

    const result = await saveBudgetDeclaration(baseInput);

    expect(result).toEqual({ id: 7 });
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("明細の entry_type/category/description は trim してから RPC に渡す", async () => {
    single.mockResolvedValue({ data: { id: 7 }, error: null });

    await saveBudgetDeclaration(baseInput);

    expect(rpc).toHaveBeenCalledWith(
      "save_budget_declaration",
      expect.objectContaining({
        p_items: [
          expect.objectContaining({
            entry_type: "income",
            category: "セミナー",
            description: "○○受託案件",
            amount: 100000,
            manager_id: null,
          }),
        ],
      }),
    );
  });

  it("declarationId / comment が null の場合、RPC には undefined を渡す（DEFAULT NULL 前提の型に合わせる）", async () => {
    single.mockResolvedValue({ data: { id: 7 }, error: null });

    await saveBudgetDeclaration(baseInput);

    expect(rpc).toHaveBeenCalledWith(
      "save_budget_declaration",
      expect.objectContaining({
        p_declaration_id: undefined,
        p_comment: undefined,
      }),
    );
  });

  it("declarationId / comment が値を持つ場合はそのまま渡す", async () => {
    single.mockResolvedValue({ data: { id: 7 }, error: null });

    await saveBudgetDeclaration({
      ...baseInput,
      declarationId: 7,
      comment: "コメント",
    });

    expect(rpc).toHaveBeenCalledWith(
      "save_budget_declaration",
      expect.objectContaining({
        p_declaration_id: 7,
        p_comment: "コメント",
      }),
    );
  });

  it("manager_id を持つ明細は、重複除去して assertManagerIdsExist に渡す", async () => {
    single.mockResolvedValue({ data: { id: 7 }, error: null });

    await saveBudgetDeclaration({
      ...baseInput,
      items: [
        { ...baseInput.items[0], manager_id: 2 },
        { ...baseInput.items[0], manager_id: 2 },
        { ...baseInput.items[0], manager_id: null },
      ],
    });

    expect(assertManagerIdsExist).toHaveBeenCalledWith(
      [2],
      "事前収支申告",
      "フォームを開き直して選び直してください。",
    );
  });

  it("assertManagerIdsExist がエラーを返したら RPC を呼ばずそのまま返す", async () => {
    assertManagerIdsExist.mockResolvedValue({
      kind: "validationFailed",
      message: "選択された担当者が見つかりません。フォームを開き直して選び直してください。",
    });

    const result = await saveBudgetDeclaration(baseInput);

    expect(result).toEqual({
      error: {
        kind: "validationFailed",
        message: "選択された担当者が見つかりません。フォームを開き直して選び直してください。",
      },
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("一意制約違反（23505）は duplicate として返す", async () => {
    single.mockResolvedValue({
      data: null,
      error: { code: UNIQUE_VIOLATION, message: "duplicate key value" },
    });

    const result = await saveBudgetDeclaration(baseInput);

    expect(result).toEqual({
      error: { kind: "duplicate", message: DUPLICATE_DECLARATION_MESSAGE },
    });
  });

  it("確定済みの月（MONTH_CLOSED）は validationFailed と確定済みメッセージで返す", async () => {
    single.mockResolvedValue({
      data: null,
      error: { code: "42501", message: MONTH_CLOSED },
    });

    const result = await saveBudgetDeclaration(baseInput);

    expect(result).toEqual({
      error: {
        kind: "validationFailed",
        message:
          "この月の事前収支申告は確定済みのため、作成・編集・削除できません。",
      },
    });
  });

  it("更新対象なし（P0002）は fetchFailed として返す", async () => {
    single.mockResolvedValue({
      data: null,
      error: { code: NO_DATA_FOUND, message: "DECLARATION_NOT_FOUND" },
    });

    const result = await saveBudgetDeclaration({
      ...baseInput,
      declarationId: 7,
    });

    expect(result).toEqual({
      error: {
        kind: "fetchFailed",
        message:
          "事前収支申告の更新対象が見つかりませんでした。既に削除されているか、編集する権限がありません。",
      },
    });
  });

  it("担当者の FK 違反（23503。TOCTOU）は validationFailed として返す", async () => {
    single.mockResolvedValue({
      data: null,
      error: { code: "23503", message: "foreign key violation" },
    });

    const result = await saveBudgetDeclaration(baseInput);

    expect(result).toEqual({
      error: {
        kind: "validationFailed",
        message:
          "選択された担当者が見つかりません。フォームを開き直して選び直してください。",
      },
    });
  });

  it("その他のエラーは新規作成/更新を区別したメッセージを返す", async () => {
    single.mockResolvedValue({
      data: null,
      error: { code: "XXXXX", message: "unexpected" },
    });

    const createResult = await saveBudgetDeclaration(baseInput);
    expect(createResult).toEqual({
      error: {
        kind: "fetchFailed",
        message: "事前収支申告の作成に失敗しました。",
      },
    });

    const updateResult = await saveBudgetDeclaration({
      ...baseInput,
      declarationId: 7,
    });
    expect(updateResult).toEqual({
      error: {
        kind: "fetchFailed",
        message: "事前収支申告の更新に失敗しました。",
      },
    });
  });

  it("書き込み権限が無いチームへの保存は RPC を呼ばず forbidden を返す", async () => {
    getAuthorizedViewer.mockResolvedValue({
      profileInfo: { id: 1, class: "teamleader", team: "Bチーム" },
    });

    const result = await saveBudgetDeclaration(baseInput);

    expect(result).toEqual({
      error: {
        kind: "forbidden",
        message: "Aチームの事前収支申告を編集する権限がありません。",
      },
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("マスタに無い分類は RPC を呼ばず validationFailed を返す（Issue #116）", async () => {
    single.mockResolvedValue({ data: { id: 7 }, error: null });

    const result = await saveBudgetDeclaration({
      ...baseInput,
      items: [{ ...baseInput.items[0], category: "旧分類" }],
    });

    expect(result).toEqual({
      error: {
        kind: "validationFailed",
        message:
          "選択された分類がマスタに登録されていません。画面を再読み込みして選び直してください。",
      },
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("種別違いのマスタ混同（収入行に支出マスタの値）も validationFailed を返す", async () => {
    const result = await saveBudgetDeclaration({
      ...baseInput,
      items: [
        { ...baseInput.items[0], entry_type: "expense", category: "セミナー" },
      ],
    });

    expect(result).toEqual({
      error: {
        kind: "validationFailed",
        message:
          "選択された分類がマスタに登録されていません。画面を再読み込みして選び直してください。",
      },
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("分類マスタの取得に失敗したら fetchFailed を返し RPC を呼ばない", async () => {
    getActiveSelectOptionsByType.mockResolvedValue({
      optionsByType: {},
      error: new Error("master fetch failed"),
    });

    const result = await saveBudgetDeclaration(baseInput);

    expect(result).toEqual({
      error: {
        kind: "fetchFailed",
        message: "事前収支申告の分類確認に失敗しました。",
      },
    });
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("deleteBudgetDeclaration", () => {
  const CLOSED_MESSAGE =
    "この月の事前収支申告は確定済みのため、作成・編集・削除できません。";

  // Chainable stub: each table gets its own terminal result.
  const buildSupabase = (results: {
    deleted: { data: unknown; error: unknown };
    declaration?: { data: unknown };
    closing?: { data: unknown };
  }) => ({
    from: (table: string) => {
      if (table === "budget_declarations") {
        return {
          delete: () => ({
            eq: () => ({
              eq: () => ({ select: () => Promise.resolve(results.deleted) }),
            }),
          }),
          select: () => ({
            eq: () => ({
              maybeSingle: () =>
                Promise.resolve(results.declaration ?? { data: null }),
            }),
          }),
        };
      }
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve(results.closing ?? { data: null }),
          }),
        }),
      };
    },
  });

  beforeEach(() => {
    createServerSupabase.mockReset();
    getAuthorizedViewer.mockReset();
    getAuthorizedViewer.mockResolvedValue({
      profileInfo: { id: 1, class: "accounting", team: null },
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("確定済みの月は RLS で 0 行になるため、確定済みメッセージを返す", async () => {
    createServerSupabase.mockReturnValue(
      buildSupabase({
        deleted: { data: [], error: null },
        declaration: { data: { target_month: "2026-10-01" } },
        closing: { data: { id: 1 } },
      }),
    );

    expect(await deleteBudgetDeclaration(1, "Aチーム")).toEqual({
      error: { kind: "validationFailed", message: CLOSED_MESSAGE },
    });
  });

  it("未確定で 0 行のときは従来どおり「削除対象が見つかりません」を返す", async () => {
    createServerSupabase.mockReturnValue(
      buildSupabase({
        deleted: { data: [], error: null },
        declaration: { data: { target_month: "2026-10-01" } },
        closing: { data: null },
      }),
    );

    const result = await deleteBudgetDeclaration(1, "Aチーム");

    expect(result.error?.kind).toBe("fetchFailed");
    expect(result.error?.message).toContain("削除対象が見つかりませんでした");
  });

  it("トリガーの MONTH_CLOSED エラーも確定済みメッセージで返す", async () => {
    createServerSupabase.mockReturnValue(
      buildSupabase({
        deleted: { data: null, error: { message: MONTH_CLOSED } },
      }),
    );

    expect(await deleteBudgetDeclaration(1, "Aチーム")).toEqual({
      error: { kind: "validationFailed", message: CLOSED_MESSAGE },
    });
  });

  it("チームリーダーは他チームの申告を削除できない（DB を呼ばず forbidden）", async () => {
    getAuthorizedViewer.mockResolvedValue({
      profileInfo: { id: 2, class: "teamleader", team: "Bチーム" },
    });

    const result = await deleteBudgetDeclaration(1, "Aチーム");

    expect(result.error?.kind).toBe("forbidden");
    expect(createServerSupabase).not.toHaveBeenCalled();
  });
});

describe("getBudgetDeclarationList", () => {
  it("チームリーダーも自チームで絞らず、全チームのマスタと申告を取得する", async () => {
    const { getSelectOptions } = await import(
      "@/app/utils/supabase/selectOptions"
    );
    vi.mocked(getSelectOptions).mockResolvedValue({
      options: [{ value: "Aチーム" }, { value: "Bチーム" }],
      error: null,
    } as never);
    getAuthorizedViewer.mockResolvedValue({
      profileInfo: { id: 2, class: "teamleader", team: "Bチーム" },
    });
    const order = vi.fn().mockResolvedValue({
      data: [
        {
          id: 1,
          team: "Aチーム",
          updated_at: null,
          profiles: { name: "山田" },
          budget_declaration_items: [{ entry_type: "income", amount: 1000 }],
        },
      ],
      error: null,
    });
    const inFilter = vi.fn();
    createServerSupabase.mockReturnValue({
      from: () => ({
        select: () => ({ eq: () => ({ order, in: inFilter }) }),
      }),
    });

    const result = await getBudgetDeclarationList("2026-10");

    expect(inFilter).not.toHaveBeenCalled();
    expect(result.rows?.map((r) => r.team)).toEqual(["Aチーム", "Bチーム"]);
    expect(result.rows?.[0].summary.incomeTotal).toBe(1000);
  });
});
