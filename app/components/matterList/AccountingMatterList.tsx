"use client";

import { Button, SimpleGrid, Table } from "@mantine/core";
import { useCallback, useMemo, useRef, useState } from "react";
import { MatterInfoWithUserNameType } from "../../types/types";
import { MatterCardDetail } from "../modal/MatterCardDetail";
import { NotificationMessage } from "../modal/NotificationMessage";
import DisplayMenu from "../buttons/display-menu";
import { MatterCard } from "../MatterCard";
import { useListDisplayMode } from "../../hooks/useListDisplayMode";
import AccountingTableHeader from "../AccountingTableHeader";
import AccountingTablebody from "../AccountingTablebody";
import {
  useAllMatterList,
  useSlackNotification,
  useCheckCompleted,
  MatterWithProfileType,
} from "../../hooks/useMatterData";
import {
  compactMatterListFilters,
  hasMatterListFilters,
} from "../../utils/matterListFilters";
import { notifyError, notifyInfo } from "../../utils/notify";
import { confirmAction } from "../../utils/confirmAction";
import { ActiveMatterFilterBar } from "./ActiveMatterFilterBar";

export const AccountingMatterList = ({
  initialData,
}: {
  initialData?: MatterWithProfileType[];
}) => {
  const slackNotificationMutation = useSlackNotification();
  const checkCompletedMutation = useCheckCompleted();
  const [checkedMatterIdList, setCheckedMatterIdList] = useState<number[]>([]);
  const [detailMatterInfo, setDetailMatterInfo] =
    useState<MatterInfoWithUserNameType | null>(null);
  const [detailOpened, setDetailOpened] = useState<boolean>(false);
  const [notificationOpened, setNotificationOpened] = useState<boolean>(false);
  const { switchDisplay, setSwitchDisplay, showCards } =
    useListDisplayMode(false);
  const [filters, setFilters] = useState<Record<string, Set<string>>>({});
  const compactedFilters = useMemo(
    () => compactMatterListFilters(filters),
    [filters],
  );
  const optionSourceRef = useRef<MatterInfoWithUserNameType[]>([]);

  // React Queryでデータを管理。
  // サーバー側で取得済みのデータを initialData としてキャッシュにシードし、
  // マウント直後の再フェッチ（同じ全件取得の二重実行）を防ぐ。
  // フィルタ条件は queryKey に含め、変更時はサーバ側で絞り込んだ結果を取る。
  const { data: rawMatterList } = useAllMatterList(
    initialData,
    compactedFilters,
  );

  // rawMatterListをMatterInfoWithUserNameType[]に変換。
  // 取得前・取得失敗時も常に配列を返し、子コンポーネントへの
  // non-null アサーションを不要にする
  const matterList: MatterInfoWithUserNameType[] = useMemo(() => {
    if (!rawMatterList) return [];

    return rawMatterList.map((matterWithProfile) => {
      const { profiles, ...matterInfo } = matterWithProfile;
      return {
        ...matterInfo,
        user_name: profiles?.name || "",
        slack_id: profiles?.slack_id || null,
      };
    });
  }, [rawMatterList]);

  if (!hasMatterListFilters(compactedFilters)) {
    optionSourceRef.current = matterList;
  }
  const headerMatterList =
    optionSourceRef.current.length > 0 ? optionSourceRef.current : matterList;

  const handleShowMatterInfo = useCallback(
    (matter: MatterInfoWithUserNameType) => {
      setDetailMatterInfo(matter);
      setDetailOpened(true);
    },
    [],
  );

  const handleCheckCard = useCallback(
    (id: number) => {
      setCheckedMatterIdList(
        checkedMatterIdList.includes(id)
          ? checkedMatterIdList.filter((matterId) => matterId !== id)
          : [...checkedMatterIdList, id],
      );
    },
    [checkedMatterIdList],
  );

  const handleCheckCompleted = useCallback(async () => {
    // フィルタ適用中も、凍結スナップショット（headerMatterList）ではなく
    // 最新の表示リストから対象を解決する
    const checkedMatterList = matterList.filter(
      (matter: MatterInfoWithUserNameType) =>
        checkedMatterIdList.includes(matter.id),
    );

    if (checkedMatterList.length === 0) {
      notifyError("完了にする案件にチェックを入れてください。");
      return;
    }

    const confirmed = await confirmAction(
      `${checkedMatterList.length}件の案件を完了にしますか？`,
    );
    if (!confirmed) return;

    const skippedDraftTitles: string[] = [];
    const targetMatterIds: number[] = [];
    for (const matterInfo of checkedMatterList) {
      if (!matterInfo.is_fixed) {
        skippedDraftTitles.push(matterInfo.title);
        continue;
      }
      if (matterInfo.unchecked_cost_count > 0) {
        const hasUncheckedCost = await confirmAction(
          `${matterInfo.title}には未払いコストがあります。完了してよろしいですか？`,
        );
        if (!hasUncheckedCost) continue;
      }
      targetMatterIds.push(matterInfo.id);
    }

    if (targetMatterIds.length === 0) {
      notifyError(
        skippedDraftTitles.length > 0
          ? `下書きのため完了できません: ${skippedDraftTitles.join("、")}`
          : "完了対象の案件がありませんでした。",
      );
      return;
    }

    if (skippedDraftTitles.length > 0) {
      notifyInfo(
        `下書きのため完了できません: ${skippedDraftTitles.join("、")}`,
      );
    }

    try {
      await checkCompletedMutation.mutateAsync(targetMatterIds);
      setCheckedMatterIdList([]);
    } catch (error) {
      console.error("確認完了に失敗しました:", error);
    }
  }, [matterList, checkedMatterIdList, checkCompletedMutation]);

  const handleSendMessage = useCallback(
    async (message: string) => {
      if (checkedMatterIdList.length === 0) {
        notifyError("送信対象となる案件にチェックを入れてください。");
        return;
      }
      if (!message.trim()) {
        notifyError("メッセージを入力してください。");
        return;
      }

      // チェックされた案件を取得（最新の表示リストから解決する）
      const checkedMatters = matterList.filter(
        (matter: MatterInfoWithUserNameType) =>
          checkedMatterIdList.includes(matter.id),
      );
      if (checkedMatters.length === 0) {
        notifyError("送信対象となる案件にチェックを入れてください。");
        return;
      }

      try {
        const { failedTitles, dbUpdateFailed } =
          await slackNotificationMutation.mutateAsync({
            matters: checkedMatters,
            message,
          });

        // 成功した案件は差し戻し済みのため、部分失敗でもモーダルとチェックは
        // クリアする（チェックを残すと再送信で成功済み案件に二重通知されるため）
        setNotificationOpened(false);
        setCheckedMatterIdList([]);

        if (dbUpdateFailed) {
          notifyError(
            "Slack通知は送信しましたが、案件のステータス更新に失敗しました。\n画面を再読み込みして状態を確認してください。",
          );
        } else if (failedTitles.length > 0) {
          notifyError(
            `以下の案件のSlack通知に失敗しました。対象を再選択して送信し直してください。\n${failedTitles.join("\n")}`,
          );
        }
      } catch (error) {
        console.error("Slack通知に失敗しました:", error);
        notifyError("Slack通知に失敗しました。");
      }
    },
    [checkedMatterIdList, matterList, slackNotificationMutation],
  );

  return (
    <div className="my-4">
      <div className="sticky top-4 bg-white z-[5]">
        <div className="flex justify-end gap-4 my-4 px-4">
          <Button
            color="green"
            disabled={checkCompletedMutation.isPending}
            onClick={handleCheckCompleted}
          >
            確認完了
          </Button>
          <Button
            color="indigo"
            disabled={slackNotificationMutation.isPending}
            onClick={() => setNotificationOpened(true)}
          >
            担当者に連絡
          </Button>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-red-700 text-sm m-4">
            ※記載の金額は、全て税抜となっております。
          </span>
          <div className="hidden md:flex justify-end px-4">
            <DisplayMenu
              switchDisplay={switchDisplay}
              onSwitchDisplay={setSwitchDisplay}
            />
          </div>
        </div>
      </div>
      <ActiveMatterFilterBar
        filters={filters}
        onClearKey={(key) =>
          setFilters((prev) => ({
            ...prev,
            [key]: new Set(),
          }))
        }
        onClearAll={() => setFilters({})}
      />
      <div className="overflow-auto h-[calc(100vh-200px)]">
        {showCards ? (
          <div className="py-4 px-8">
            <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="xl">
              {matterList.map((matter: MatterInfoWithUserNameType) => (
                <MatterCard
                  key={matter.id}
                  variant="accounting"
                  matter={matter}
                  isChecked={checkedMatterIdList.includes(matter.id)}
                  onOpen={handleShowMatterInfo}
                  onCheck={() => handleCheckCard(matter.id)}
                />
              ))}
            </SimpleGrid>
          </div>
        ) : (
          <Table stickyHeader>
            <Table.Thead className="bg-white">
              {
                <AccountingTableHeader
                  matterList={headerMatterList}
                  filters={filters}
                  setFilters={setFilters}
                />
              }
            </Table.Thead>
            <Table.Tbody>
              {matterList.map((matter: MatterInfoWithUserNameType) => (
                <AccountingTablebody
                  key={matter.id}
                  matter={matter}
                  isChecked={checkedMatterIdList.includes(matter.id)}
                  checkedMatterIdList={checkedMatterIdList}
                  setCheckedMatterIdList={setCheckedMatterIdList}
                  onShowMatterInfo={handleShowMatterInfo}
                />
              ))}
            </Table.Tbody>
          </Table>
        )}
      </div>

      {detailOpened && detailMatterInfo && (
        <MatterCardDetail
          variant="accounting"
          matterInfo={detailMatterInfo}
          opened={detailOpened}
          setOpened={setDetailOpened}
        />
      )}
      {notificationOpened && (
        <NotificationMessage
          opened={notificationOpened}
          setOpened={setNotificationOpened}
          onSendMessage={handleSendMessage}
        />
      )}
    </div>
  );
};
