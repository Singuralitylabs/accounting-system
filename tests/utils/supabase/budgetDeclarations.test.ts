import { beforeEach, describe, expect, it, vi } from "vitest";

const { createServerSupabase, getAuthorizedViewer, assertManagerIdsExist } =
  vi.hoisted(() => ({
    createServerSupabase: vi.fn(),
    getAuthorizedViewer: vi.fn(),
    assertManagerIdsExist: vi.fn(),
  }));

vi.mock("@/app/utils/supabase/clients", () => ({ createServerSupabase }));
vi.mock("@/app/utils/supabase/viewerAccess", () => ({ getAuthorizedViewer }));
vi.mock("@/app/utils/supabase/profiles", () => ({ assertManagerIdsExist }));
// budgetDeclarations.ts は getBudgetDeclarationList 用に selectOptions.ts も
// import するが、その先（selectOptionsCache.ts）が React の cache()（RSC 用の
// メモ化。Next.js のビルド下でのみ機能し、素の Vitest/Node 環境では未対応）を
// モジュール評価時に呼ぶため、実体を読み込ませないようモックする
vi.mock("@/app/utils/supabase/selectOptions", () => ({ getSelectOptions: vi.fn() }));

import { saveBudgetDeclaration } from "@/app/utils/supabase/budgetDeclarations";
import { DUPLICATE_DECLARATION_MESSAGE } from "@/app/utils/budgetDeclarationValidation";
import { NO_DATA_FOUND, UNIQUE_VIOLATION } from "@/app/utils/supabase/errorCodes";
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
});
