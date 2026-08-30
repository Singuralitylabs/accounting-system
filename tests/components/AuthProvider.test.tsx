import { beforeEach, describe, expect, it, vi } from "vitest";

const { getCachedUser, getCachedProfileInfo, getActiveSelectOptionsByType } =
  vi.hoisted(() => ({
    getCachedUser: vi.fn(),
    getCachedProfileInfo: vi.fn(),
    getActiveSelectOptionsByType: vi.fn(),
  }));

vi.mock("@/app/utils/supabase/requestCache", () => ({
  getCachedUser,
  getCachedProfileInfo,
}));

vi.mock("@/app/utils/supabase/selectOptionsCache", () => ({
  getActiveSelectOptionsByType,
}));

vi.mock("@/app/components/Header", () => ({ default: () => null }));
vi.mock("@/app/components/providers/InitialOptionalLoader", () => ({
  InitialOptionsLoader: () => null,
}));

import AuthProvider from "@/app/components/auth/AuthProvider";

const user = { id: "user-uuid" };
const profile = { id: 1, name: "山田", class: "public" };
const optionsByType = {
  team: [{ id: 1, value: "開発" }],
  category: [{ id: 2, value: "講演" }],
  item: [{ id: 3, value: "交通費" }],
  certificate: [{ id: 4, value: "領収書" }],
};

describe("AuthProvider", () => {
  beforeEach(() => {
    getCachedUser.mockReset();
    getCachedProfileInfo.mockReset();
    getActiveSelectOptionsByType.mockReset();
    getCachedUser.mockResolvedValue({ user, error: null });
    getCachedProfileInfo.mockResolvedValue({ profileInfo: profile });
    getActiveSelectOptionsByType.mockResolvedValue({
      optionsByType,
      error: null,
    });
  });

  it("取得に成功したら throw しない", async () => {
    await expect(AuthProvider({ children: "child" })).resolves.toBeTruthy();
  });

  it("選択肢マスタの取得に失敗したら空のマスタを投入せず throw する", async () => {
    getActiveSelectOptionsByType.mockResolvedValue({
      optionsByType: {},
      error: new Error("選択肢の取得に失敗しました。"),
    });

    await expect(AuthProvider({ children: "child" })).rejects.toThrow(
      "選択肢の取得に失敗しました。",
    );
  });

  it("プロフィール取得の失敗は描画を止めない（認可は middleware / RLS が担う）", async () => {
    getCachedProfileInfo.mockResolvedValue({
      error: new Error("プロファイル情報の取得に失敗しました。"),
    });

    await expect(AuthProvider({ children: "child" })).resolves.toBeTruthy();
  });

  it("未ログイン時は選択肢マスタを取得せずに描画する", async () => {
    getCachedUser.mockResolvedValue({ user: null, error: null });

    await expect(AuthProvider({ children: "child" })).resolves.toBeTruthy();
    expect(getActiveSelectOptionsByType).not.toHaveBeenCalled();
  });

  it("Auth session missing は children のみを描画する", async () => {
    getCachedUser.mockRejectedValue(new Error("Auth session missing!"));

    await expect(AuthProvider({ children: "child" })).resolves.toBeTruthy();
  });

  it("予期せぬエラーは握りつぶさず再 throw する", async () => {
    getCachedUser.mockRejectedValue(new Error("予期せぬエラー"));

    await expect(AuthProvider({ children: "child" })).rejects.toThrow(
      "予期せぬエラー",
    );
  });
});
