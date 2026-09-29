import { MantineProvider } from "@mantine/core";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  getExtraEntryList,
  getExtraEntrySuggestions,
  getRecurringCostList,
  getAllUserInfo,
  getSelectOptions,
} = vi.hoisted(() => ({
  getExtraEntryList: vi.fn(),
  getExtraEntrySuggestions: vi.fn(),
  getRecurringCostList: vi.fn(),
  getAllUserInfo: vi.fn(),
  getSelectOptions: vi.fn(),
}));

vi.mock("@/app/utils/supabase/extraEntries", () => ({
  getExtraEntryList,
  getExtraEntrySuggestions,
}));
vi.mock("@/app/utils/supabase/recurringCosts", () => ({
  getRecurringCostList,
}));
vi.mock("@/app/utils/supabase/profiles", () => ({ getAllUserInfo }));
vi.mock("@/app/utils/supabase/selectOptions", () => ({ getSelectOptions }));

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
import DynamicDashboardUsers from "@/app/components/dynamic/DynamicDashboardUsers";
import DynamicDashboardOptions from "@/app/components/dynamic/DynamicDashboardOptions";

const okOptions = { options: [{ id: 1, value: "開発" }], error: null };

describe("Dynamic* サーバコンポーネントの取得エラー", () => {
  beforeEach(() => {
    getExtraEntryList.mockReset();
    getExtraEntrySuggestions.mockReset();
    getRecurringCostList.mockReset();
    getAllUserInfo.mockReset();
    getSelectOptions.mockReset();
    getSelectOptions.mockResolvedValue(okOptions);
    getExtraEntryList.mockResolvedValue({ extraEntryList: [], error: null });
    getExtraEntrySuggestions.mockResolvedValue({
      suggestionList: [],
      error: null,
    });
    getRecurringCostList.mockResolvedValue({
      recurringCostList: [],
      error: null,
    });
    getAllUserInfo.mockResolvedValue({ userInfoList: [], error: null });
  });

  afterEach(() => {
    vi.restoreAllMocks();
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

  describe("DynamicDashboardUsers", () => {
    it("取得に成功したら throw しない", async () => {
      await expect(DynamicDashboardUsers()).resolves.toBeTruthy();
    });

    it("ユーザー情報の取得に失敗したら throw する（error.tsx を表示する）", async () => {
      getAllUserInfo.mockResolvedValue({
        userInfoList: null,
        error: { message: "permission denied" },
      });

      await expect(DynamicDashboardUsers()).rejects.toThrow(
        "ユーザー情報の取得に失敗しました。",
      );
    });

    it("チームの選択肢の取得に失敗しても throw せず、UserList に失敗を伝える", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      getSelectOptions.mockResolvedValue({
        options: [],
        error: new Error("選択肢の取得に失敗しました。"),
      });

      const element = (await DynamicDashboardUsers()) as ReactElement<{
        teamList: string[];
        teamListError: boolean;
      }>;

      expect(element.props.teamList).toEqual([]);
      expect(element.props.teamListError).toBe(true);
    });
  });

  describe("DynamicDashboardOptions", () => {
    const renderOptions = async () =>
      renderToStaticMarkup(
        <MantineProvider>{await DynamicDashboardOptions()}</MantineProvider>,
      );

    it("取得に成功したら throw せず、エラーを表示しない", async () => {
      const html = await renderOptions();

      expect(html).toContain("案件・費用で使う項目");
      expect(html).not.toContain("編集する項目");
      expect(html).not.toContain("取得に失敗しました");
      expect(getSelectOptions).toHaveBeenCalledTimes(6);
    });

    it("選択肢の取得に失敗しても throw せず、失敗した種類のパネルの中にエラーを表示する", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      getSelectOptions.mockImplementation(async (typeName: string) =>
        typeName === "payment_method"
          ? { options: [], error: new Error("選択肢の取得に失敗しました。") }
          : okOptions,
      );

      const html = await renderOptions();

      expect(html).toContain("決済方法情報の取得に失敗しました。");
      expect(html).not.toContain("チーム情報の取得に失敗しました。");
    });
  });
});
