// @vitest-environment jsdom

import { screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import DashboardNav, {
  findActiveDashboardMenu,
} from "@/app/components/dashboard/DashboardNav";
import { renderWithMantine } from "../../testUtils/renderWithMantine";

const { navigation } = vi.hoisted(() => ({
  navigation: { pathname: "/dashboard/users" },
}));

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
}));

describe("findActiveDashboardMenu", () => {
  it.each([
    ["/dashboard/users", "/dashboard/users"],
    ["/dashboard/options", "/dashboard/options"],
    // 配下にサブルートが増えても選択中のまま
    ["/dashboard/options/team", "/dashboard/options"],
  ])("%s ではメニュー %s を選択中とする", (pathname, expected) => {
    expect(findActiveDashboardMenu(pathname)?.href).toBe(expected);
  });

  it.each(["/dashboard", "/dashboard/users-archive", "/matters"])(
    "%s はどのメニューにも一致しない（前方一致はパスの区切りで判定する）",
    (pathname) => {
      expect(findActiveDashboardMenu(pathname)).toBeUndefined();
    },
  );

  it("複数のメニューが一致する場合は、最も長く一致したメニューを選ぶ", () => {
    const items = [
      { href: "/dashboard", label: "親" },
      { href: "/dashboard/users", label: "子" },
    ];

    expect(findActiveDashboardMenu("/dashboard/users/1", items)?.label).toBe(
      "子",
    );
    expect(findActiveDashboardMenu("/dashboard/other", items)?.label).toBe(
      "親",
    );
  });
});

describe("DashboardNav", () => {
  beforeEach(() => {
    navigation.pathname = "/dashboard/users";
  });

  it("サイドメニューに 2 つのメニューがリンクとして並び、表示中の画面が選択中になる", () => {
    navigation.pathname = "/dashboard/options";
    renderWithMantine(<DashboardNav />);

    const sideMenu = within(
      screen.getByRole("navigation", {
        name: "管理画面メニュー（サイドメニュー）",
      }),
    );
    const users = sideMenu.getByRole("link", { name: "ユーザー管理" });
    const options = sideMenu.getByRole("link", { name: "項目管理" });

    expect(users).toHaveAttribute("href", "/dashboard/users");
    expect(options).toHaveAttribute("href", "/dashboard/options");
    expect(options).toHaveAttribute("aria-current", "page");
    expect(users).not.toHaveAttribute("aria-current");
  });

  it("モバイル用のタブも同じメニューをリンクで持ち、表示中の画面のタブが選択中になる", () => {
    renderWithMantine(<DashboardNav />);

    const tabs = within(
      screen.getByRole("navigation", { name: "管理画面メニュー（タブ）" }),
    );
    const users = tabs.getByRole("tab", { name: "ユーザー管理" });
    const options = tabs.getByRole("tab", { name: "項目管理" });

    expect(users).toHaveAttribute("href", "/dashboard/users");
    expect(options).toHaveAttribute("href", "/dashboard/options");
    expect(users).toHaveAttribute("aria-selected", "true");
    expect(options).toHaveAttribute("aria-selected", "false");
  });
});
