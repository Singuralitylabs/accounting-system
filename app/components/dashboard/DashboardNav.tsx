"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NavLink, Tabs } from "@mantine/core";
import { matchesRoute } from "../../utils/permissions";

export type DashboardMenuItem = {
  href: string;
  label: string;
};

// 管理画面（/dashboard）のメニュー。/dashboard 自体は /dashboard/users へリダイレクトする
export const DASHBOARD_MENU_ITEMS: DashboardMenuItem[] = [
  { href: "/dashboard/users", label: "ユーザー管理" },
  { href: "/dashboard/options", label: "項目管理" },
];

// 選択中のメニューを判定する。MattersTabs と同じく前方一致で判定し
// （各メニュー配下に将来サブルートが増えてもハイライトが外れないように）、
// 複数が一致する場合は href が最も長い＝最も具体的なメニューを優先する
export const findActiveDashboardMenu = (
  pathname: string,
  items: DashboardMenuItem[] = DASHBOARD_MENU_ITEMS,
) =>
  [...items]
    .sort((a, b) => b.href.length - a.href.length)
    .find((item) => matchesRoute(pathname, item.href));

// 管理画面のメニュー。PC（768px 以上）は左のサイドメニュー、モバイル（768px 未満）は
// 画面上部の横並びタブで表示する。切り替えは CSS（Tailwind の md ブレークポイント）で行い、
// useViewportSize のように初回描画（幅 0）でモバイル表示が一瞬出ることを避ける
const DashboardNav = () => {
  const pathname = usePathname();
  const activeItem = findActiveDashboardMenu(pathname);

  return (
    <>
      <nav
        aria-label="管理画面メニュー（サイドメニュー）"
        className="hidden w-48 shrink-0 border-r border-gray-200 bg-slate-50 py-4 md:block"
      >
        {DASHBOARD_MENU_ITEMS.map((item) => (
          <NavLink
            key={item.href}
            component={Link}
            href={item.href}
            label={item.label}
            active={activeItem?.href === item.href}
            aria-current={activeItem?.href === item.href ? "page" : undefined}
          />
        ))}
      </nav>
      <nav
        aria-label="管理画面メニュー（タブ）"
        className="border-b border-gray-200 bg-slate-50 px-4 py-3 md:hidden"
      >
        <Tabs value={activeItem?.href ?? null} variant="pills" radius="xl">
          <Tabs.List>
            {DASHBOARD_MENU_ITEMS.map((item) => (
              <Tabs.Tab
                key={item.href}
                value={item.href}
                // Mantine が渡す root props の type="button" は <a> では意味を持たないため
                // 除外する（MattersTabs と同じ）
                renderRoot={({ type, ...rootProps }) => (
                  <Link href={item.href} {...rootProps} />
                )}
              >
                {item.label}
              </Tabs.Tab>
            ))}
          </Tabs.List>
        </Tabs>
      </nav>
    </>
  );
};

export default DashboardNav;
