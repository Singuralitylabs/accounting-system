"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type MattersTabItem = {
  href: string;
  label: string;
};

type Props = {
  tabs: MattersTabItem[];
};

// 案件カード（/matters）配下のタブ切替。表示するタブ自体は
// layout（サーバ側）で ROUTE_PERMISSIONS に基づき絞り込み済み。
// タブが1つ（自分の案件のみ）の場合は切替の意味がないため表示しない。
const MattersTabs = ({ tabs }: Props) => {
  const pathname = usePathname();

  if (tabs.length <= 1) {
    return null;
  }

  return (
    <div className="mx-auto mb-2 flex max-w-5xl gap-2 border-b border-gray-200 px-4">
      {tabs.map((tab) => {
        const isActive = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={isActive ? "page" : undefined}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${
              isActive
                ? "border-gray-800 text-gray-900"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
};

export default MattersTabs;
