"use client";

import { Button, SimpleGrid, Table } from "@mantine/core";
import { useEffect, useState } from "react";
import { MatterInfoWithUserNameType } from "../types/types";
import { MatterCardDetailModalForAccounting } from "./modal/MatterCardDetailForAccounting";
import { updateMatterInfo } from "../utils/supabaseServer";
import { NotificationMessage } from "./modal/NotificationMessage";
import { useRouter } from "next/navigation";
import DisplayMenu from "./buttons/display-menu";
import { MatterCardForAccounting } from "./MatterCardForAccounting";
import { useViewportSize } from "@mantine/hooks";
import checkMatterInfoList from "../utils/checkMatterInfoList";
import sendMessageToSlack from "../utils/slack/sendMessageToSlack";
import AccoutingTableHeader from "./AccoutingTableHeader";
import AccountingTablebody from "./AccountingTablebody";

export const AccountingMatterList = ({
  matterList,
}: {
  matterList: MatterInfoWithUserNameType[] | null;
}) => {
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

  const router = useRouter();

  const handleShowMatterInfo = (matter: MatterInfoWithUserNameType) => {
    setDetailMatterInfo(matter);
    setDetailOpened(true);
  };

  const handleCheckCard = (id: number) => {
    setCheckedMatterIdList(
      checkedMatterIdList.includes(id)
        ? checkedMatterIdList.filter((matterId) => matterId !== id)
        : [...checkedMatterIdList, id]
    );
  };

  const handleCheckCompleted = async () => {
    const checkedMatterList = matterList?.filter((matter) =>
      checkedMatterIdList.includes(matter.id)
    );
    if (checkedMatterList) {
      await checkMatterInfoList(checkedMatterList);
    }
    setCheckedMatterIdList([]);
    router.refresh();
  };

  const handleSendMessage = async (message: string) => {
    if (checkedMatterIdList.length === 0) {
      alert("送信対象となる案件にチェックを入れてください。");
      return;
    }
    if (!message.trim()) {
      alert("メッセージを入力してください。");
      return;
    }

    for (const id of checkedMatterIdList) {
      const matterToNotify: MatterInfoWithUserNameType | undefined =
        matterList?.find((matter) => matter.id === id);
      if (!matterToNotify) {
        console.error(`案件ID${id}が見つかりません。`);
        continue;
      }

      const ret = await sendMessageToSlack(
        matterToNotify.slack_id!,
        matterToNotify.user_name!,
        matterToNotify.title,
        message
      );
      if (!ret) return;

      const { user_name, slack_id, ...matterInfo } = matterToNotify;
      if (matterInfo) {
        matterInfo.is_fixed = false;
        await updateMatterInfo(matterInfo);
      } else {
        console.error(`案件ID${id}が見つかりません。`);
      }
    }

    setNotificationOpened(false);
    setCheckedMatterIdList([]);
    router.refresh();
  };

  const filteredMatterList = matterList?.filter((matter) => {
    return Object.entries(filters).every(([key, values]) => {
      if (values.size === 0) return true;
      const value = matter[key as keyof MatterInfoWithUserNameType];
      return value && values.has(value.toString());
    });
  });

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
              {matterList?.map((matter) => (
                <MatterCardForAccounting
                  key={matter.id}
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
                <AccoutingTableHeader
                  matterList={matterList!}
                  filters={filters}
                  setFilters={setFilters}
                />
              }
            </Table.Thead>
            <Table.Tbody>
              {filteredMatterList?.map((matter) => (
                <AccountingTablebody
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
