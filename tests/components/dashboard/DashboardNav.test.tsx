// @vitest-environment jsdom

import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { forwardRef, type ComponentProps } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import DashboardNav, {
  findActiveDashboardMenu,
  UNSAVED_CHANGES_LEAVE_MESSAGE,
} from "@/app/components/dashboard/DashboardNav";
import {
  DashboardUnsavedChangesProvider,
  useReportDashboardUnsavedChanges,
} from "@/app/components/dashboard/DashboardUnsavedChanges";
import { renderWithMantine } from "../../testUtils/renderWithMantine";

const { navigation, push, confirmAction } = vi.hoisted(() => ({
  navigation: { pathname: "/dashboard/users" },
  push: vi.fn(),
  confirmAction: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => ({ push }),
}));
vi.mock("@/app/utils/confirmAction", () => ({ confirmAction }));
// next/link は App Router のコンテキストが無いと遷移処理で失敗するため、クリックの
// 既定動作（遷移）が止められたかを fireEvent の戻り値で確かめられる素の <a> にする
vi.mock("next/link", () => ({
  default: forwardRef<HTMLAnchorElement, ComponentProps<"a">>(
    function MockLink(props, ref) {
      return <a ref={ref} {...props} />;
    },
  ),
}));

// 画面側（UserList 等）の代わりに未保存の変更の有無を知らせる
const ReportUnsaved = ({ value }: { value: boolean }) => {
  useReportDashboardUnsavedChanges(value);
  return null;
};

const renderNav = (hasUnsavedChanges: boolean) =>
  renderWithMantine(
    <DashboardUnsavedChangesProvider>
      <DashboardNav />
      <ReportUnsaved value={hasUnsavedChanges} />
    </DashboardUnsavedChangesProvider>,
  );

const sideMenuLink = (name: string) =>
  within(
    screen.getByRole("navigation", {
      name: "管理画面メニュー（サイドメニュー）",
    }),
  ).getByRole("link", { name });

// クリックし、画面側のハンドラが既定動作（リンクの遷移）を止めたかを返す。
// jsdom は <a> の遷移を実装していないため、判定後は document で既定動作を止める
const clickPrevented = (element: HTMLElement, init?: MouseEventInit) => {
  let prevented = false;
  const listener = (event: Event) => {
    prevented = event.defaultPrevented;
    event.preventDefault();
  };
  document.addEventListener("click", listener);
  fireEvent.click(element, init);
  document.removeEventListener("click", listener);
  return prevented;
};

const mobileTab = (name: string) =>
  within(
    screen.getByRole("navigation", { name: "管理画面メニュー（タブ）" }),
  ).getByRole("tab", { name });

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

describe("DashboardNav: 未保存の変更がある場合の画面切り替え", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    navigation.pathname = "/dashboard/users";
  });

  it.each([
    ["サイドメニュー", sideMenuLink],
    ["モバイル用のタブ", mobileTab],
  ])(
    "%s: 未保存の変更があれば確認し、キャンセルなら遷移しない",
    async (_label, getLink) => {
      confirmAction.mockResolvedValue(false);
      renderNav(true);

      expect(clickPrevented(getLink("項目管理"))).toBe(true);
      await waitFor(() =>
        expect(confirmAction).toHaveBeenCalledWith(
          UNSAVED_CHANGES_LEAVE_MESSAGE,
        ),
      );
      expect(push).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["サイドメニュー", sideMenuLink],
    ["モバイル用のタブ", mobileTab],
  ])("%s: 確認で OK なら遷移する", async (_label, getLink) => {
    confirmAction.mockResolvedValue(true);
    renderNav(true);

    fireEvent.click(getLink("項目管理"));

    await waitFor(() =>
      expect(push).toHaveBeenCalledWith("/dashboard/options"),
    );
  });

  it("未保存の変更が無ければ確認せず、リンクの通常の遷移に任せる", () => {
    renderNav(false);

    expect(clickPrevented(sideMenuLink("項目管理"))).toBe(false);
    expect(confirmAction).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  it("表示中の画面のメニューや、新しいタブで開く操作（Ctrl+クリック）では確認しない", () => {
    renderNav(true);

    expect(clickPrevented(sideMenuLink("ユーザー管理"))).toBe(false);
    expect(clickPrevented(sideMenuLink("項目管理"), { ctrlKey: true })).toBe(
      false,
    );
    expect(confirmAction).not.toHaveBeenCalled();
  });
});
