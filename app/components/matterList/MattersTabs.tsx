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

  // 前方一致でアクティブなタブを判定する（各タブ配下に将来サブルートが増えても
  // ハイライトが外れないように）。"/matters" は他タブの href の前方一致にもなるため、
  // href が最も長い＝最も具体的なタブを優先する
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
              // Mantine が渡す root props には button 専用の type="button" が
              // 含まれる。Link（<a>）にそのまま乗せると意味を持たない属性に
              // なるため除外する（ignoreRestSiblings によりこの type は
              // no-unused-vars の対象外）
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
