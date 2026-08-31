"use client";

import React, { FC, useState } from "react";
import { formatCurrency } from "../../utils/formatter";
import { formatTimeToJp } from "../../utils/formatter";
import { MatterCardDetail } from "../modal/MatterCardDetail";
import DisplayMenu from "../buttons/display-menu";
import { Badge } from "@mantine/core";

// チーム案件一覧で使用する型（担当者情報を含む）
export type TeamMatterType = {
  id: number;
  title: string;
  category: string;
  team: string;
  description: string | null;
  start_date: string | null;
  total_amount: number | null;
  total_cost: number | null;
  is_fixed: boolean | null;
  is_completed: boolean | null;
  inserted_at: string;
  profiles: {
    name: string;
    slack_id: string | null;
  } | null;
};

interface ReadonlyMatterListProps {
  matterList: TeamMatterType[];
}

const ReadonlyMatterList: FC<ReadonlyMatterListProps> = ({ matterList }) => {
  const [switchDisplay, setSwitchDisplay] = useState(false); // false: カード表示, true: テーブル表示
  const [selectedMatter, setSelectedMatter] = useState<TeamMatterType | null>(
    null,
  );
  const [detailOpened, setDetailOpened] = useState(false);

  const getStatusBadge = (
    isFixed: boolean | null,
    isCompleted: boolean | null,
  ) => {
    if (isCompleted) {
      return <Badge color="green">経理確認完了</Badge>;
    } else if (isFixed) {
      return <Badge color="red">経理申請中</Badge>;
    } else {
      return <Badge color="blue">下書き</Badge>;
    }
  };

  const handleShowDetail = (matter: TeamMatterType) => {
    setSelectedMatter(matter);
    setDetailOpened(true);
  };

  const renderCardView = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {matterList.map((matter) => (
        <div
          key={matter.id}
          className="bg-white rounded-lg shadow-md p-4 border"
        >
          <div className="flex justify-between items-start mb-2">
            <h3 className="text-lg font-semibold truncate">{matter.title}</h3>
            {getStatusBadge(matter.is_fixed, matter.is_completed)}
          </div>

          <div className="space-y-2 text-sm text-gray-600">
            <div className="flex justify-between">
              <span>案件ID:</span>
              <span>#{matter.id}</span>
            </div>
            <div className="flex justify-between">
              <span>担当者:</span>
              <span className="font-medium">
                {matter.profiles?.name || "不明"}
              </span>
            </div>
            <div className="flex justify-between">
              <span>分類:</span>
              <span>{matter.category}</span>
            </div>
            <div className="flex justify-between">
              <span>合計請求額:</span>
              <span className="font-bold text-green-600">
                {formatCurrency(matter.total_amount || 0)}
              </span>
            </div>
            <div className="flex justify-between">
              <span>合計コスト:</span>
              <span className="font-bold text-red-600">
                {formatCurrency(matter.total_cost || 0)}
              </span>
            </div>
            <div className="flex justify-between">
              <span>作成日:</span>
              <span>{formatTimeToJp(matter.inserted_at)}</span>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t flex justify-between items-center">
            <div className="text-xs text-gray-500">
              ※ チームリーダーは閲覧のみ可能です
            </div>
            <button
              onClick={() => handleShowDetail(matter)}
              className="px-3 py-1 bg-blue-500 text-white rounded text-xs hover:bg-blue-600"
            >
              詳細
            </button>
          </div>
        </div>
      ))}
    </div>
  );

  const renderTableView = () => (
    <div className="overflow-x-auto">
      <table className="min-w-full bg-white border border-gray-300">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              案件ID
            </th>
            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              案件名
            </th>
            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              担当者
            </th>
            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              分類
            </th>
            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              合計請求額
            </th>
            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              合計コスト
            </th>
            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              状態
            </th>
            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              操作
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200">
          {matterList.map((matter) => (
            <tr key={matter.id} className="hover:bg-gray-50">
              <td className="px-4 py-2 text-sm text-gray-900">#{matter.id}</td>
              <td className="px-4 py-2 text-sm text-gray-900 font-medium">
                {matter.title}
              </td>
              <td className="px-4 py-2 text-sm text-gray-900">
                {matter.profiles?.name || "不明"}
              </td>
              <td className="px-4 py-2 text-sm text-gray-900">
                {matter.category}
              </td>
              <td className="px-4 py-2 text-sm font-bold text-green-600">
                {formatCurrency(matter.total_amount || 0)}
              </td>
              <td className="px-4 py-2 text-sm font-bold text-red-600">
                {formatCurrency(matter.total_cost || 0)}
              </td>
              <td className="px-4 py-2 text-sm">
                {getStatusBadge(matter.is_fixed, matter.is_completed)}
              </td>
              <td className="px-4 py-2 text-sm">
                <button
                  onClick={() => handleShowDetail(matter)}
                  className="px-3 py-1 bg-blue-500 text-white rounded text-xs hover:bg-blue-600"
                >
                  詳細
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  if (!matterList || matterList.length === 0) {
    return (
      <div className="px-8 py-8 text-center">
        <p className="text-gray-500">表示できるチーム案件がありません。</p>
        <p className="text-xs text-gray-400 mt-2">
          チームリーダー権限が設定されているか、チームが正しく設定されているかご確認ください。
        </p>
      </div>
    );
  }

  return (
    <div className="px-8 py-4">
      {/* 表示切替ボタン */}
      <div className="mb-4 flex justify-between items-center">
        <div className="text-sm text-gray-500">
          {matterList.length}件の案件が表示されています
        </div>
        <DisplayMenu
          switchDisplay={switchDisplay}
          onSwitchDisplay={setSwitchDisplay}
        />
      </div>

      {/* メイン表示エリア */}
      {switchDisplay ? renderTableView() : renderCardView()}

      {/* 詳細モーダル */}
      {selectedMatter && (
        <MatterCardDetail
          variant="readonly"
          matterInfo={{
            ...selectedMatter,
            user_name: selectedMatter.profiles?.name || "不明",
            slack_id: selectedMatter.profiles?.slack_id || null,
            accounting_memo: null,
            business_count: null,
            cost_count: null,
            has_updates: null,
            unchecked_cost_count: 0,
            updated_at: selectedMatter.inserted_at,
            user_id: 0,
            parent_matter_id: null,
          }}
          opened={detailOpened}
          setOpened={setDetailOpened}
        />
      )}
    </div>
  );
};

export { ReadonlyMatterList };
export default ReadonlyMatterList;
