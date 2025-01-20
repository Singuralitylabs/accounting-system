"use client";

import { Button, Checkbox, Table } from "@mantine/core";
import { useState } from "react";
import { MatterInfoWithUserNameType } from "../types/types";
import { MatterCardDetailModalForAccounting } from "./modal/MatterCardDetailForAccounting";
import { FaCheck } from "react-icons/fa";
import { updateMatterInfo } from "../utils/supabaseServer";
import { NotificationMessage } from "./modal/NotificationMessage";
import { notifications } from "@mantine/notifications";
import { sendSlackNotification } from "../actions";
import { useRouter } from "next/navigation";
import TableInfo from "./TableInfo";

const elementListInAccounting = [
  "ID",
  "案件名",
  "担当者",
  "チーム",
  "分類",
  "合計請求額",
  "取引先数",
  "合計コスト",
  "コスト数",
  "未払いコスト数",
];

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
  const router = useRouter();

  const handleShowMatterInfo = (matter: MatterInfoWithUserNameType) => {
    setDetailMatterInfo(matter);
    setDetailOpened(true);
  };

  const handleCheckCompleted = async () => {
    if (checkedMatterIdList.length === 0) {
      alert("完了にする案件にチェックを入れてください。");
      return;
    }
    const isCompleted = window.confirm(
      `${checkedMatterIdList.length}件の案件を完了にしますか？`
    );
    if (!isCompleted) {
      alert("案件の完了処理を中止しました。");
      return;
    }
    for (const id of checkedMatterIdList) {
      const matterInfo = matterList?.find((matter) => matter.id === id);
      if (matterInfo) {
        if (!matterInfo.is_fixed) {
          alert(`ID[${id}]の案件は未確定のため、完了できません。`);
          continue;
        }
        let { user_name, slack_id, ...updatedMatter } = matterInfo;
        updatedMatter.is_completed = true;
        await updateMatterInfo(updatedMatter);
      } else {
        alert(`ID[${id}]の案件の完了に失敗しました。`);
        console.error(`案件ID${id}が見つかりません。`);
      }
    }
    alert(`案件をチェック処理を完了しました。`);
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

    try {
      for (const id of checkedMatterIdList) {
        const matterToNotify: MatterInfoWithUserNameType | undefined =
          matterList?.find((matter) => matter.id === id);
        if (!matterToNotify) {
          console.error(`案件ID${id}が見つかりません。`);
          continue;
        }

        const slackName = matterToNotify?.slack_id
          ? `<@${matterToNotify.slack_id}>`
          : matterToNotify?.user_name;
        const body =
          `案件：${matterToNotify?.title}\n` +
          `担当者：${slackName}\n` +
          message;
        const slackResult = await sendSlackNotification(body);

        if (slackResult.error) {
          throw new Error(slackResult.error);
        }
        const { user_name, slack_id, ...updateData } = matterToNotify;
        if (updateData) {
          updateData.is_fixed = false;
          await updateMatterInfo(updateData);
        } else {
          console.error(`案件ID${id}が見つかりません。`);
        }
      }

      notifications.show({
        title: "通知成功",
        message: "担当者への通知が完了しました",
        color: "green",
      });
    } catch (error) {
      console.error("通知送信エラー:", error);
      notifications.show({
        title: "エラー",
        message: "通知の送信に失敗しました",
        color: "red",
      });
      throw error;
    } finally {
      setNotificationOpened(false);
      setCheckedMatterIdList([]);
      router.refresh();
    }
  };

  const tableHeads = (
    <Table.Tr key={elementListInAccounting[0]}>
      <Table.Th></Table.Th>
      {elementListInAccounting.map((element, index) => (
        <Table.Th key={index} className="whitespace-nowrap px-4 text-center">
          {element}
        </Table.Th>
      ))}
    </Table.Tr>
  );

  const tableInfoList = matterList?.map((matter) => {
    return (
      <Table.Tr
        key={matter.id}
        bg={
          checkedMatterIdList.includes(matter.id)
            ? "var(--mantine-color-blue-light)"
            : matter.is_completed
            ? "var(--mantine-color-gray-light)"
            : matter.is_fixed
            ? "var(--mantine-color-red-light)"
            : undefined
        }
      >
        <Table.Td>
          {matter.is_completed ? (
            <FaCheck />
          ) : (
            <Checkbox
              aria-label="案件チェック"
              checked={checkedMatterIdList.includes(matter.id)}
              onChange={(event) =>
                setCheckedMatterIdList(
                  event.currentTarget.checked
                    ? [...checkedMatterIdList, matter.id]
                    : checkedMatterIdList.filter((id) => id !== matter.id)
                )
              }
            />
          )}
        </Table.Td>
        <TableInfo
          matter={matter}
          username={matter.user_name!}
          itemList={elementListInAccounting}
        />
        <Table.Td className="whitespace-nowrap px-4">
          <button
            onClick={() => handleShowMatterInfo(matter)}
            className="bg-gray-700 hover:bg-gray-500 px-2 rounded text-white"
          >
            詳細
          </button>
        </Table.Td>
      </Table.Tr>
    );
  });

  return (
    <div className="my-4">
      <div className="sticky top-4 bg-white z-10">
        <div className="flex justify-end gap-4 my-4">
          <Button color="green" onClick={handleCheckCompleted}>
            確認完了
          </Button>
          <Button color="indigo" onClick={() => setNotificationOpened(true)}>
            担当者に連絡
          </Button>
        </div>
      </div>
      <span className="text-red-700 text-sm m-4">
        ※記載の金額は、全て税抜となっております。
      </span>

      <div className="overflow-auto h-[calc(100vh-200px)]">
        <Table stickyHeader>
          <Table.Thead className="bg-white">{tableHeads}</Table.Thead>
          <Table.Tbody>{tableInfoList}</Table.Tbody>
        </Table>
      </div>

      {detailOpened && detailMatterInfo ? (
        <MatterCardDetailModalForAccounting
          matterInfo={detailMatterInfo}
          opened={detailOpened}
          setOpened={setDetailOpened}
        />
      ) : null}
      {notificationOpened ? (
        <NotificationMessage
          opened={notificationOpened}
          setOpened={setNotificationOpened}
          onSendMessage={handleSendMessage}
        />
      ) : null}
    </div>
  );
};
