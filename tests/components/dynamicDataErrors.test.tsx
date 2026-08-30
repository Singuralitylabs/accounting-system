import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getExtraEntryList,
  getRecurringCostList,
  getAllUserInfo,
  getSelectOptions,
} = vi.hoisted(() => ({
  getExtraEntryList: vi.fn(),
  getRecurringCostList: vi.fn(),
  getAllUserInfo: vi.fn(),
  getSelectOptions: vi.fn(),
}));

vi.mock("@/app/utils/supabase/extraEntries", () => ({ getExtraEntryList }));
vi.mock("@/app/utils/supabase/recurringCosts", () => ({
  getRecurringCostList,
}));
vi.mock("@/app/utils/supabase/profiles", () => ({ getAllUserInfo }));
vi.mock("@/app/utils/supabase/selectOptions", () => ({ getSelectOptions }));

// 子コンポーネント（クライアントコンポーネント）は描画しないためスタブ化する
vi.mock("@/app/components/extraEntries/ExtraEntryList", () => ({
  default: () => null,
}));
vi.mock("@/app/components/recurringCosts/RecurringCostList", () => ({
  default: () => null,
}));
vi.mock("@/app/components/UserList", () => ({ default: () => null }));
vi.mock("@/app/components/SelectOptionList", () => ({ default: () => null }));

import DynamicExtraEntries from "@/app/components/dynamic/DynamicExtraEntries";
import DynamicRecurringCosts from "@/app/components/dynamic/DynamicRecurringCosts";
import DynamicDashboard from "@/app/components/dynamic/DynamicDashboard";

const okOptions = { options: [{ id: 1, value: "開発" }], error: null };

describe("Dynamic* サーバコンポーネントの取得エラー", () => {
  beforeEach(() => {
    getExtraEntryList.mockReset();
    getRecurringCostList.mockReset();
    getAllUserInfo.mockReset();
    getSelectOptions.mockReset();
    getSelectOptions.mockResolvedValue(okOptions);
    getExtraEntryList.mockResolvedValue({ extraEntryList: [], error: null });
    getRecurringCostList.mockResolvedValue({
      recurringCostList: [],
      error: null,
    });
    getAllUserInfo.mockResolvedValue({ userInfoList: [], error: null });
  });

  describe("DynamicExtraEntries", () => {
    it("取得に成功したら throw しない", async () => {
      await expect(DynamicExtraEntries()).resolves.toBeTruthy();
    });

    it("一覧の取得に失敗したら「0 件」として描画せず throw する", async () => {
      getExtraEntryList.mockResolvedValue({
        extraEntryList: null,
        error: { message: "permission denied" },
      });

      await expect(DynamicExtraEntries()).rejects.toThrow(
        "経理追加収支情報の取得に失敗しました。",
      );
    });

    it("選択肢の取得に失敗したら throw する", async () => {
      getSelectOptions.mockResolvedValue({
        options: [],
        error: new Error("選択肢の取得に失敗しました。"),
      });

      await expect(DynamicExtraEntries()).rejects.toThrow(
        "選択肢情報の取得に失敗しました。",
      );
    });

    it("ユーザー情報の取得に失敗したら throw する", async () => {
      getAllUserInfo.mockResolvedValue({
        userInfoList: null,
        error: { message: "permission denied" },
      });

      await expect(DynamicExtraEntries()).rejects.toThrow(
        "ユーザー情報の取得に失敗しました。",
      );
    });
  });

  describe("DynamicRecurringCosts", () => {
    it("取得に成功したら throw しない", async () => {
      await expect(DynamicRecurringCosts()).resolves.toBeTruthy();
    });

    it("一覧の取得に失敗したら initialData に空配列を渡さず throw する", async () => {
      getRecurringCostList.mockResolvedValue({
        recurringCostList: null,
        error: { message: "permission denied" },
      });

      await expect(DynamicRecurringCosts()).rejects.toThrow(
        "定期費用情報の取得に失敗しました。",
      );
    });

    it("選択肢の取得に失敗したら throw する", async () => {
      getSelectOptions.mockResolvedValue({
        options: [],
        error: new Error("選択肢の取得に失敗しました。"),
      });

      await expect(DynamicRecurringCosts()).rejects.toThrow(
        "選択肢情報の取得に失敗しました。",
      );
    });
  });

  describe("DynamicDashboard", () => {
    it("取得に成功したら throw しない", async () => {
      await expect(DynamicDashboard()).resolves.toBeTruthy();
    });

    it("ユーザー情報の取得に失敗したら throw する", async () => {
      getAllUserInfo.mockResolvedValue({
        userInfoList: null,
        error: { message: "permission denied" },
      });

      await expect(DynamicDashboard()).rejects.toThrow(
        "ユーザー情報の取得に失敗しました。",
      );
    });
  });
});
