"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Tabs } from "@mantine/core";

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
// ヘッダーの角丸ボタン列（濃色・矩形）と隣接して並ぶため、pills タブ＋背景バンドで
// 見た目を変え、直下に別のナビゲーション行が続くように誤読されないようにする。
const MattersTabs = ({ tabs }: Props) => {
  const pathname = usePathname();

  if (tabs.length <= 1) {
    return null;
  }

  return (
    <div className="mb-4 border-b border-gray-200 bg-slate-50 px-8 py-3">
      <Tabs value={pathname} variant="pills" radius="xl">
        <Tabs.List>
          {tabs.map((tab) => (
            <Tabs.Tab
              key={tab.href}
              value={tab.href}
              renderRoot={(rootProps) => (
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
