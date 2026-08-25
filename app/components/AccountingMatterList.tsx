"use client";

import { Button, SimpleGrid, Table } from "@mantine/core";
import { useCallback, useEffect, useMemo, useState } from "react";
import { MatterInfoWithUserNameType } from "../types/types";
import { MatterCardDetailModalForAccounting } from "./modal/MatterCardDetailForAccounting";
import { NotificationMessage } from "./modal/NotificationMessage";
import DisplayMenu from "./buttons/display-menu";
import { MatterCard } from "./MatterCard";
import { useViewportSize } from "@mantine/hooks";
import AccountingTableHeader from "./AccountingTableHeader";
import AccountingTablebody from "./AccountingTablebody";
import {
  useAllMatterList,
  useSlackNotification,
  useCheckCompleted,
  MatterWithProfileType,
} from "../hooks/useMatterData";

export const AccountingMatterList = ({
  initialData,
}: {
  initialData?: MatterWithProfileType[];
}) => {
  // React Queryでデータを管理。
  // サーバー側で取得済みのデータを initialData としてキャッシュにシードし、
  // マウント直後の再フェッチ（同じ全件取得の二重実行）を防ぐ。
  const { data: rawMatterList } = useAllMatterList(initialData);
  const slackNotificationMutation = useSlackNotification();
  const checkCompletedMutation = useCheckCompleted();

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
  const [checkedMatterIdList, setCheckedMatterIdList] = useState<number[]>([]);
  const [detailMatterInfo, setDetailMatterInfo] =
    useState<MatterInfoWithUserNameType | null>(null);
  const [detailOpened, setDetailOpened] = useState<boolean>(false);
  const [notificationOpened, setNotificationOpened] = useState<boolean>(false);
  const [switchDisplay, setSwitchDisplay] = useState(false);
  const { width } = useViewportSize();
  const [isMobileView, setIsMobileView] = useState(false);
  const [filters, setFilters] = useState<Record<string, Set<string>>>({});

  const MD_BREAKPOINT = 768;

  useEffect(() => {
    setIsMobileView(width < MD_BREAKPOINT);
  }, [width]);

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
    const checkedMatterList = matterList?.filter(
      (matter: MatterInfoWithUserNameType) =>
        checkedMatterIdList.includes(matter.id),
    );

    if (checkedMatterList && checkedMatterList.length > 0) {
      try {
        await checkCompletedMutation.mutateAsync(checkedMatterList);
        setCheckedMatterIdList([]);
      } catch (error) {
        console.error("確認完了に失敗しました:", error);
        alert("確認完了に失敗しました。");
      }
    }
  }, [matterList, checkedMatterIdList, checkCompletedMutation]);

  const handleSendMessage = useCallback(
    async (message: string) => {
      if (checkedMatterIdList.length === 0) {
        alert("送信対象となる案件にチェックを入れてください。");
        return;
      }
      if (!message.trim()) {
        alert("メッセージを入力してください。");
        return;
      }

      // チェックされた案件を取得
      const checkedMatters =
        matterList?.filter((matter: MatterInfoWithUserNameType) =>
          checkedMatterIdList.includes(matter.id),
        ) || [];

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
          alert(
            "Slack通知は送信しましたが、案件のステータス更新に失敗しました。\n画面を再読み込みして状態を確認してください。",
          );
        } else if (failedTitles.length > 0) {
          alert(
            `以下の案件のSlack通知に失敗しました。対象を再選択して送信し直してください。\n${failedTitles.join("\n")}`,
          );
        }
      } catch (error) {
        console.error("Slack通知に失敗しました:", error);
        alert("Slack通知に失敗しました。");
      }
    },
    [checkedMatterIdList, matterList, slackNotificationMutation],
  );

  const filteredMatterList = useMemo(
    () =>
      matterList?.filter((matter: MatterInfoWithUserNameType) => {
        return Object.entries(filters).every(([key, values]) => {
          if (values.size === 0) return true;
          const value = matter[key as keyof MatterInfoWithUserNameType];
          return value && values.has(value.toString());
        });
      }),
    [matterList, filters],
  );

  return (
    <div className="my-4">
      <div className="sticky top-4 bg-white z-[5]">
        <div className="flex justify-end gap-4 my-4 px-4">
          <Button color="green" onClick={handleCheckCompleted}>
            確認完了
          </Button>
          <Button color="indigo" onClick={() => setNotificationOpened(true)}>
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
      <div className="overflow-auto h-[calc(100vh-200px)]">
        {isMobileView || switchDisplay ? (
          <div className="py-4 px-8">
            <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="xl">
              {matterList?.map((matter: MatterInfoWithUserNameType) => (
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
                  matterList={matterList}
                  filters={filters}
                  setFilters={setFilters}
                />
              }
            </Table.Thead>
            <Table.Tbody>
              {filteredMatterList?.map((matter: MatterInfoWithUserNameType) => (
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
        <MatterCardDetailModalForAccounting
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
