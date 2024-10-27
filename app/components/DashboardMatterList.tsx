"use client";

import { Button, Checkbox, Table } from "@mantine/core";
import { useEffect, useState } from "react";
import { elementListInDashboard } from "../types/params";
import { MatterType } from "../types/types";
import { MatterCardDetailModalForAccounting } from "./modal/MatterCardDetailForAccounting";
import { FaCheck } from "react-icons/fa";
import {
  getUserInfo,
  updateMatterInfoInSupabase,
} from "../utils/supabaseServer";
import { NotificationMessage } from "./modal/NotificationMessage";
import { notifications } from "@mantine/notifications";
import { sendSlackNotification } from "../actions";

type MatterInfoWithUserNameType = {
  user_name: string | null;
} & MatterType;

export const DashboardMatterList = ({
  matterList,
}: {
  matterList: MatterType[] | null;
}) => {
  const [checkedMatterIdList, setCheckedMatterIdList] = useState<number[]>([]);
  const [matterInfo, setMatterInfo] = useState<MatterType | null>(null);
  const [matterInfoListWithName, setMatterInfoListWithName] = useState<
    MatterInfoWithUserNameType[] | null
  >(null);
  const [detailOpened, setDetailOpened] = useState<boolean>(false);
  const [notificationOpened, setNotificationOpened] = useState<boolean>(false);

  useEffect(() => {
    const getUserName = async (matter: MatterType) => {
      const userInfo = await getUserInfo(matter.user_id);
      return userInfo ? userInfo.name : null;
    };

    const fetchMatterInfoList = async () => {
      if (!matterList) {
        setMatterInfoListWithName(null);
        return;
      }

      try {
        const matterInfoList: MatterInfoWithUserNameType[] = await Promise.all(
          matterList.map(async (matter) => {
            const userName = await getUserName(matter);
            return { ...matter, user_name: userName };
          })
        );
        setMatterInfoListWithName(matterInfoList);
      } catch (error) {
        console.error("Error fetching user names:", error);
        setMatterInfoListWithName(null);
      }
    };
    fetchMatterInfoList();
  }, [matterList]);

  const formatCurrency = (amount: number | null) => {
    if (amount === null) return "-";
    return new Intl.NumberFormat("ja-JP", {
      style: "currency",
      currency: "JPY",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "-";
    const date = new Date(dateString);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}/${month}/${day}`;
  };

  const handleShowMatterInfo = (matter: MatterType) => {
    setMatterInfo(matter);
    setDetailOpened(true);
  };

  const handleCheckCompleted = async () => {
    const isCompleted = window.confirm(
      `${checkedMatterIdList.length}件の案件を完了にしますか？`
    );
    if (!isCompleted) {
      return;
    }
    for (const id of checkedMatterIdList) {
      let updatedMatter: MatterType | undefined = matterList?.find(
        (matter) => matter.id === id
      );
      if (updatedMatter) {
        updatedMatter.is_completed = true;
        await updateMatterInfoInSupabase(updatedMatter);
      } else {
        console.error(`案件ID${id}が見つかりません。`);
      }
    }
    setCheckedMatterIdList([]);
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
        const matterToNotify: MatterType | undefined = matterList?.find(
          (matter) => matter.id === id
        );
        const body =
          `案件：${matterToNotify?.title}\n` +
          `担当者：${matterToNotify?.user_id}\n` +
          message;
        const slackResult = await sendSlackNotification(body);

        if (slackResult.error) {
          throw new Error(slackResult.error);
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
    }
  };

  const tableHeads = (
    <Table.Tr key={elementListInDashboard[0]}>
      <Table.Th></Table.Th>
      {elementListInDashboard.map((element) => (
        <Table.Th className="whitespace-nowrap px-4 text-center">
          {element}
        </Table.Th>
      ))}
    </Table.Tr>
  );

  const tableInfoList = matterInfoListWithName?.map((matter) => {
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
        <Table.Td className="whitespace-nowrap px-4">{matter.id}</Table.Td>
        <Table.Td className="whitespace-nowrap px-4">{matter.title}</Table.Td>
        <Table.Td className="whitespace-nowrap px-4">
          {matter.user_name}
        </Table.Td>
        <Table.Td className="whitespace-nowrap px-4">{matter.team}</Table.Td>
        <Table.Td className="whitespace-nowrap px-4">
          {matter.category}
        </Table.Td>
        <Table.Td className="whitespace-nowrap px-4">
          {matter.billing_address}
        </Table.Td>
        <Table.Td className="whitespace-nowrap px-4 text-right">
          {formatCurrency(matter.amount)}
        </Table.Td>
        <Table.Td className="whitespace-nowrap px-4">
          {formatDate(matter.period_date)}
        </Table.Td>
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
      <Table>
        <Table.Thead>{tableHeads}</Table.Thead>
        <Table.Tbody>{tableInfoList}</Table.Tbody>
      </Table>
      {detailOpened && matterInfo ? (
        <MatterCardDetailModalForAccounting
          matterInfo={matterInfo}
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
      <div className="flex justify-center gap-4 my-4">
        <Button onClick={handleCheckCompleted}>確認完了</Button>
        <Button color="green" onClick={() => setNotificationOpened(true)}>
          担当者に連絡
        </Button>
      </div>
    </div>
  );
};
