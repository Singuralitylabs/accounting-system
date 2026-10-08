"use client";

import {
  Alert,
  Button,
  LoadingOverlay,
  SimpleGrid,
  Table,
} from "@mantine/core";
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
  partitionCheckedMatters,
} from "../../utils/matterListFilters";
import { useListPagination } from "../../hooks/useListPagination";
import { MatterListPagination } from "./MatterListPagination";
import { notifyError, notifyInfo } from "../../utils/notify";
import { confirmAction } from "../../utils/confirmAction";
import { ActiveMatterFilterBar } from "./ActiveMatterFilterBar";
import { LoadingSpinner } from "../LoadingSpinner";

export const AccountingMatterList = ({
  initialData,
  slackChannelName,
}: {
  initialData?: MatterWithProfileType[];
  slackChannelName?: string;
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

  // Seed the cache with server-fetched initialData to avoid a duplicate full fetch right after mount; filters are in the queryKey, so changes fetch server-filtered results.
  const {
    data: rawMatterList,
    isPlaceholderData,
    isFetching,
    isError,
  } = useAllMatterList(initialData, compactedFilters);
  // placeholderData keeps the previous rows; overlay them until the new filter (or a refetch) settles.
  const isListBusy = isPlaceholderData || isFetching;
  const hasList = Array.isArray(rawMatterList);

  // Always an array (also before fetch / on failure), so children need no non-null assertion.
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

  // Client-side pagination to limit DOM size; server filtering and checked selection are unchanged. Selection persists across pages and target resolution covers the whole matterList; only rows hidden by server filtering are outside it (hiddenCheckedIds in partitionCheckedMatters).
  const {
    page,
    setPage,
    perPage,
    setPerPage,
    total,
    totalPages,
    startIndex,
    endIndex,
    pagedItems,
    showPagination,
  } = useListPagination(matterList, {
    resetKey: JSON.stringify(compactedFilters),
  });

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
    const { visibleChecked, hiddenCheckedIds } = partitionCheckedMatters(
      matterList,
      checkedMatterIdList,
    );

    if (visibleChecked.length === 0) {
      notifyError(
        hiddenCheckedIds.length > 0
          ? "表示中の案件にチェックが入っていません。絞り込みを解除するか、表示中の案件にチェックを入れてください。"
          : "完了にする案件にチェックを入れてください。",
      );
      return;
    }

    const hiddenNote =
      hiddenCheckedIds.length > 0
        ? `\n（チェック済み ${checkedMatterIdList.length} 件のうち ${hiddenCheckedIds.length} 件は絞り込みで非表示のため対象外です）`
        : "";
    const confirmed = await confirmAction(
      `${visibleChecked.length}件の案件を完了にしますか？${hiddenNote}`,
    );
    if (!confirmed) return;

    const skippedDraftTitles: string[] = [];
    const targetMatterIds: number[] = [];
    for (const matterInfo of visibleChecked) {
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
      const completedIds = new Set(targetMatterIds);
      setCheckedMatterIdList((prev) =>
        prev.filter((id) => !completedIds.has(id)),
      );
    } catch (error) {
      console.error("確認完了に失敗しました:", error);
    }
  }, [matterList, checkedMatterIdList, checkCompletedMutation]);

  const handleSendMessage = useCallback(
    async (message: string): Promise<boolean> => {
      if (checkedMatterIdList.length === 0) {
        notifyError("送信対象となる案件にチェックを入れてください。");
        return false;
      }
      if (!message.trim()) {
        notifyError("メッセージを入力してください。");
        return false;
      }

      const { visibleChecked, hiddenCheckedIds } = partitionCheckedMatters(
        matterList,
        checkedMatterIdList,
      );
      if (visibleChecked.length === 0) {
        notifyError(
          "表示中の案件にチェックが入っていません。絞り込みを解除するか、表示中の案件にチェックを入れてください。",
        );
        return false;
      }

      if (hiddenCheckedIds.length > 0) {
        const confirmed = await confirmAction(
          `チェック済み ${checkedMatterIdList.length} 件のうち ${hiddenCheckedIds.length} 件は絞り込みで非表示のため対象外です。表示中の ${visibleChecked.length} 件に送信しますか？`,
        );
        if (!confirmed) return false;
      }

      try {
        const { failedTitles, dbUpdateFailed } =
          await slackNotificationMutation.mutateAsync({
            matters: visibleChecked,
            message,
          });

        // Uncheck only the sent (displayed) rows and keep hidden checks. Also uncheck on partial failure, since keeping sent IDs would double-notify on resend.
        const sentIds = new Set(visibleChecked.map((matter) => matter.id));
        setCheckedMatterIdList((prev) => prev.filter((id) => !sentIds.has(id)));

        if (dbUpdateFailed) {
          notifyError(
            "Slack通知は送信しましたが、案件のステータス更新に失敗しました。\n画面を再読み込みして状態を確認してください。",
          );
        } else if (failedTitles.length > 0) {
          notifyError(
            `以下の案件のSlack通知に失敗しました。対象を再選択して送信し直してください。\n${failedTitles.join("\n")}`,
          );
        }
        return true;
      } catch (error) {
        console.error("Slack通知に失敗しました:", error);
        notifyError("Slack通知に失敗しました。");
        return false;
      }
    },
    [checkedMatterIdList, matterList, slackNotificationMutation],
  );

  return (
    <div className="relative my-4">
      <LoadingOverlay visible={isListBusy && hasList} />
      <div className="sticky top-4 bg-white z-[5]">
        <div className="flex justify-end gap-4 my-4 px-4">
          <Button
            color="green"
            loading={checkCompletedMutation.isPending}
            onClick={handleCheckCompleted}
          >
            確認完了
          </Button>
          <div className="flex flex-col items-center">
            <Button
              color="indigo"
              loading={slackNotificationMutation.isPending}
              onClick={() => setNotificationOpened(true)}
            >
              担当者に連絡
            </Button>
            {slackChannelName && (
              <span
                className="text-xs text-gray-500 mt-1"
                data-testid="slack-channel-name-label"
              >
                投稿先: {slackChannelName}
              </span>
            )}
          </div>
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
      {isError && (
        <Alert
          color="red"
          title="案件一覧の取得に失敗しました"
          className="mx-4 mb-4"
        >
          {hasList
            ? "表示中の内容は取得済みのものです。時間をおいてページを再読み込みしてください。"
            : "時間をおいてページを再読み込みしてください。"}
        </Alert>
      )}
      {!hasList && !isError ? (
        <LoadingSpinner />
      ) : hasList ? (
        <>
          <div className="overflow-auto h-[calc(100vh-200px)]">
            {showCards ? (
              <div className="py-4 px-8">
                <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="xl">
                  {pagedItems.map((matter: MatterInfoWithUserNameType) => (
                    <div
                      key={matter.id}
                      style={{
                        contentVisibility: "auto",
                        containIntrinsicSize: "auto 280px",
                      }}
                    >
                      <MatterCard
                        variant="accounting"
                        matter={matter}
                        isChecked={checkedMatterIdList.includes(matter.id)}
                        onOpen={handleShowMatterInfo}
                        onCheck={() => handleCheckCard(matter.id)}
                      />
                    </div>
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
                  {pagedItems.map((matter: MatterInfoWithUserNameType) => (
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
          {showPagination && (
            <MatterListPagination
              page={page}
              totalPages={totalPages}
              onPageChange={setPage}
              perPage={perPage}
              onPerPageChange={setPerPage}
              startIndex={startIndex}
              endIndex={endIndex}
              total={total}
            />
          )}
        </>
      ) : null}

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
          channelName={slackChannelName}
        />
      )}
    </div>
  );
};
