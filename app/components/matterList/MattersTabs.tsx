"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Tabs } from "@mantine/core";
import { matchesRoute } from "../../utils/permissions";

export type MattersTabItem = {
  href: string;
  label: string;
};

type Props = {
  tabs: MattersTabItem[];
};

// Tabs under /matters; which tabs to show is already filtered in the (server) layout by ROUTE_PERMISSIONS. Hidden when there is a single tab. Pills on a background band, so it is not mistaken for another nav row below the header's button row.
const MattersTabs = ({ tabs }: Props) => {
  const pathname = usePathname();

  if (tabs.length <= 1) {
    return null;
  }

  // Prefix match for the active tab (so future subroutes keep it highlighted); "/matters" prefixes other tabs' hrefs too, so the longest href wins.
  const activeTab = [...tabs]
    .sort((a, b) => b.href.length - a.href.length)
    .find((tab) => matchesRoute(pathname, tab.href));

  return (
    <div className="mb-4 border-b border-gray-200 bg-slate-50 px-8 py-3">
      <Tabs value={activeTab?.href ?? null} variant="pills" radius="xl">
        <Tabs.List>
          {tabs.map((tab) => (
            <Tabs.Tab
              key={tab.href}
              value={tab.href}
              // Drop Mantine's root prop type="button", meaningless on <a> (ignoreRestSiblings exempts it from no-unused-vars).
              renderRoot={({ type, ...rootProps }) => (
                <Link href={tab.href} {...rootProps} />
              )}
            >
              {tab.label}
            </Tabs.Tab>
          ))}
        </Tabs.List>
      </Tabs>
    </div>
  );
};

export default MattersTabs;
