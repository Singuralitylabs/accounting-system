import { beforeEach, describe, expect, it, vi } from "vitest";

const { createServerSupabase } = vi.hoisted(() => ({
  createServerSupabase: vi.fn(),
}));

vi.mock("@/app/utils/supabase/clients", () => ({
  createServerSupabase,
}));

// getAllUserInfo は参照しないが、requestCache 経由の react cache を
// テスト環境に持ち込まないためモックする
vi.mock("@/app/utils/supabase/requestCache", () => ({
  getCachedProfileInfo: vi.fn(),
  getCachedProfileInfoById: vi.fn(),
}));

import { getAllUserInfo } from "@/app/utils/supabase/profiles";

const order = vi.fn();
const select = vi.fn(() => ({ order }));
const from = vi.fn(() => ({ select }));

describe("getAllUserInfo", () => {
  beforeEach(() => {
    order.mockReset();
    select.mockClear();
    from.mockClear();
    createServerSupabase.mockReturnValue({ from });
  });

  it("取得できたら一覧と error: null を返す", async () => {
    const rows = [{ id: 1, name: "山田" }];
    order.mockResolvedValue({ data: rows, error: null });

    const result = await getAllUserInfo();

    expect(from).toHaveBeenCalledWith("profiles");
    expect(result).toEqual({ userInfoList: rows, error: null });
  });

  it("0 件は成功として返す（エラーにしない）", async () => {
    order.mockResolvedValue({ data: [], error: null });

    const { userInfoList, error } = await getAllUserInfo();

    expect(userInfoList).toEqual([]);
    expect(error).toBeNull();
  });

  it("DB エラーを握りつぶさず、空配列に置き換えずに返す", async () => {
    const dbError = { message: "permission denied for table profiles" };
    order.mockResolvedValue({ data: null, error: dbError });

    const { userInfoList, error } = await getAllUserInfo();

    // 取得失敗を「0 件」と区別できるよう、error をそのまま伝播する
    expect(error).toBe(dbError);
    expect(userInfoList).toBeNull();
  });
});
