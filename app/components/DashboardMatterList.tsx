"use client";

import { Button, Checkbox, Table } from "@mantine/core";
import { useState } from "react";
import { elementListInDashboard } from "../types/params";
import { MatterType } from "../types/types";
import { MatterCardDetailModalForAccounting } from "./modal/MatterCardDetailForAccounting";
import { FaCheck } from "react-icons/fa";
import { updateMatterInfoInSupabase } from "../utils/supabaseServer";
import { NotificationMessage } from "./modal/NotificationMessage";

export const DashboardMatterList = ({
  matterList,
}: {
  matterList: MatterType[] | null;
}) => {
  const [checkedMatterIdList, setCheckedMatterIdList] = useState<number[]>([]);
  const [matterInfo, setMatterInfo] = useState<MatterType | null>(null);
  const [detailOpened, setDetailOpened] = useState<boolean>(false);
  const [notificationOpened, setNotificationOpened] = useState<boolean>(false);

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

  const handleNotifyToUser = async () => {
    setNotificationOpened(true);
    for (const id of checkedMatterIdList) {
    }
    setCheckedMatterIdList([]);
  };

  const handleSendMessage = (message: string) => {
    console.log("送信されたメッセージ:", message);
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
        <Table.Td className="whitespace-nowrap px-4">{matter.id}</Table.Td>
        <Table.Td className="whitespace-nowrap px-4">{matter.title}</Table.Td>
        <Table.Td className="whitespace-nowrap px-4">{matter.user_id}</Table.Td>
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
        <Button color="green" onClick={handleNotifyToUser}>
          担当者に連絡
        </Button>
      </div>
    </div>
  );
};
