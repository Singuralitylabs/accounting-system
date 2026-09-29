"use client";

import Link from "next/link";
import type { MouseEvent } from "react";
import { usePathname, useRouter } from "next/navigation";
import { NavLink, Tabs } from "@mantine/core";
import { matchesRoute } from "../../utils/permissions";
import { confirmAction } from "../../utils/confirmAction";
import { useDashboardHasUnsavedChanges } from "./DashboardUnsavedChanges";

export type DashboardMenuItem = {
  href: string;
  label: string;
};

export const DASHBOARD_MENU_ITEMS: DashboardMenuItem[] = [
  { href: "/dashboard/users", label: "ユーザー管理" },
  { href: "/dashboard/options", label: "項目管理" },
];

// Pick the selected menu by prefix match (like MattersTabs) so future subroutes keep it highlighted; when several match, the longest href (most specific) wins.
export const findActiveDashboardMenu = (
  pathname: string,
  items: DashboardMenuItem[] = DASHBOARD_MENU_ITEMS,
) =>
  [...items]
    .sort((a, b) => b.href.length - a.href.length)
    .find((item) => matchesRoute(pathname, item.href));

export const UNSAVED_CHANGES_LEAVE_MESSAGE =
  "未保存の変更があります。破棄して移動しますか？";

// Side menu on PC (768px+), horizontal tabs on mobile. Switched by CSS (Tailwind md) rather than useViewportSize, which flashes mobile on first render (width 0).
const DashboardNav = () => {
  const pathname = usePathname();
  const router = useRouter();
  const activeItem = findActiveDashboardMenu(pathname);
  const hasUnsavedChanges = useDashboardHasUnsavedChanges();

  // Confirm before switching away with unsaved changes (beforeunload does not fire for in-app navigation); opening in a new tab (modifier / middle click) keeps the current edits, so let it through.
  const handleNavigate = async (
    event: MouseEvent<HTMLElement>,
    href: string,
  ) => {
    if (!hasUnsavedChanges || href === activeItem?.href) return;
    if (
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }
    event.preventDefault();
    const confirmed = await confirmAction(UNSAVED_CHANGES_LEAVE_MESSAGE);
    if (confirmed) {
      router.push(href);
    }
  };

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
            onClick={(event) => handleNavigate(event, item.href)}
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
                onClick={(event) => handleNavigate(event, item.href)}
                // Drop Mantine's root prop type="button", meaningless on <a> (same as MattersTabs).
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
