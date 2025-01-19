import React from "react";
import { MatterType } from "../types/types";
import { ActionIcon, Badge, Menu, Table } from "@mantine/core";
import { BsThreeDotsVertical } from "react-icons/bs";

type Props = {
  matter: MatterType;
  onOpenCard: (matter: MatterType) => void;
  onCopyCard: (matter: MatterType) => void;
  onDeleteCard: (matter: MatterType) => void;
};

const UserTableInfo = ({
  matter,
  onOpenCard,
  onCopyCard,
  onDeleteCard,
}: Props) => {
  const formatCurrency = (amount: number | null) => {
    if (amount === null) return "-";
    return new Intl.NumberFormat("ja-JP", {
      style: "currency",
      currency: "JPY",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  return (
    <Table.Tr
      key={matter.id}
      bg={
        matter.is_completed
          ? "var(--mantine-color-green-light)"
          : matter.is_fixed
          ? "var(--mantine-color-red-light)"
          : "var(--mantine-color-blue-light)"
      }
    >
      <Table.Td className="whitespace-nowrap px-4">
        {matter.is_completed ? (
          <Badge color="green">経理確認完了</Badge>
        ) : matter.is_fixed ? (
          <Badge color="red">経理申請中</Badge>
        ) : (
          <Badge color="blue">下書き</Badge>
        )}
      </Table.Td>
      <Table.Td className="whitespace-nowrap px-4">{matter.id}</Table.Td>
      <Table.Td className="whitespace-nowrap px-4" title={matter.title}>
        {matter.title.length > 15
          ? `${matter.title.slice(0, 15)}...`
          : matter.title}
      </Table.Td>
      <Table.Td className="whitespace-nowrap px-4">{matter.team}</Table.Td>
      <Table.Td className="whitespace-nowrap px-4">{matter.category}</Table.Td>
      <Table.Td className="whitespace-nowrap px-4 text-right">
        {formatCurrency(matter.total_amount)}
      </Table.Td>
      <Table.Td className="whitespace-nowrap px-4 text-right">
        {matter.business_count}
      </Table.Td>
      <Table.Td className="whitespace-nowrap px-4 text-right">
        {formatCurrency(matter.total_cost)}
      </Table.Td>
      <Table.Td className="whitespace-nowrap px-4 text-right">
        {matter.cost_count}
      </Table.Td>
      <Table.Td className="whitespace-nowrap px-4">
        <button
          onClick={() => onOpenCard(matter)}
          className="bg-blue-500 hover:bg-blue-700 px-2 rounded text-white"
        >
          開く
        </button>
      </Table.Td>
      <Table.Td>
        <Menu position="bottom-end" shadow="md">
          <Menu.Target>
            <ActionIcon variant="transparent" size="sm">
              <BsThreeDotsVertical />
            </ActionIcon>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Item onClick={() => onCopyCard(matter)}>コピー</Menu.Item>
            {!matter.is_completed && !matter.is_fixed && (
              <Menu.Item color="red" onClick={() => onDeleteCard(matter)}>
                削除
              </Menu.Item>
            )}
          </Menu.Dropdown>
        </Menu>
      </Table.Td>
    </Table.Tr>
  );
};

export default UserTableInfo;
