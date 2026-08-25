"use client";

import { Button, Card, Text, Badge, Group } from "@mantine/core";
import { useEffect, useState } from "react";
import { MatterInfoWithUserNameType, MatterType } from "../types/types";
import ThreedotsMenu from "./buttons/threedots-menu";
import { formatCurrency, formatTimeToJp } from "../utils/formatter";

type UserMatterCardProps = {
  variant: "user";
  matter: MatterType;
  onOpen: (matter: MatterType) => void;
  onCopy: (matter: MatterType) => void;
  onDelete: (matter: MatterType) => void;
};

type AccountingMatterCardProps = {
  variant: "accounting";
  matter: MatterInfoWithUserNameType;
  isChecked: boolean;
  onOpen: (matter: MatterInfoWithUserNameType) => void;
  onCheck: (id: number) => void;
};

export type MatterCardProps = UserMatterCardProps | AccountingMatterCardProps;

function UserMatterCard({
  matter,
  onOpen,
  onCopy,
  onDelete,
}: UserMatterCardProps) {
  return (
    <Card p="md" radius="md" className="border relative" shadow="sm">
      <Group justify="space-between" align="flex-start">
        <Text
          fw={700}
          size="lg"
          mt={5}
          className="truncate w-2/3 overflow-hidden whitespace-nowrap"
        >
          {matter.title}
        </Text>
        <div className="absolute top-4 right-2 flex items-center gap-2">
          {matter.is_completed ? (
            <Badge color="green">経理確認完了</Badge>
          ) : matter.is_fixed ? (
            <Badge color="red">経理申請中</Badge>
          ) : (
            <Badge color="blue">下書き</Badge>
          )}
          <ThreedotsMenu matter={matter} onCopy={onCopy} onDelete={onDelete} />
        </div>
      </Group>
      <Text>案件ID: {matter.id}</Text>
      <Text>分類: {matter.category}</Text>
      <Text>チーム: {matter.team}</Text>
      <Text>合計請求額: {formatCurrency(matter.total_amount)}</Text>
      <Text>合計コスト: {formatCurrency(matter.total_cost)}</Text>
      <Group justify="flex-end" align="center" mt="md">
        <Text c="dimmed" size="xs" tt="uppercase" fw={700}>
          作成日時：{formatTimeToJp(matter.inserted_at)}
        </Text>
      </Group>
      <Button
        variant="outline"
        className="mt-4"
        onClick={() => onOpen(matter)}
        size="sm"
      >
        開く
      </Button>
    </Card>
  );
}

function AccountingMatterCard({
  matter,
  isChecked,
  onOpen,
  onCheck,
}: AccountingMatterCardProps) {
  const [isSelected, setIsSelected] = useState(false);

  useEffect(() => {
    setIsSelected(isChecked);
  }, [isChecked]);

  const handleCardClick = (e: React.MouseEvent) => {
    if (
      (e.target as HTMLElement).closest(".detail-button-wrapper") ||
      matter.is_completed
    ) {
      return;
    }
    setIsSelected(!isSelected);
    onCheck(matter.id);
  };

  return (
    <Card
      p="md"
      radius="md"
      className={`border relative ${isSelected && "border-blue-700"} ${
        !matter.is_completed &&
        "hover:shadow-lg hover:border-blue-300 hover:cursor-pointer"
      }`}
      shadow="sm"
      onClick={handleCardClick}
    >
      <Group justify="space-between" align="flex-start">
        <Text
          fw={700}
          size="lg"
          mt={5}
          className="truncate w-2/3 overflow-hidden whitespace-nowrap"
        >
          {matter.title}
        </Text>
        <div className="absolute top-4 right-2 flex flex-col items-end gap-1">
          {matter.is_completed ? (
            <Badge color="green">経理確認完了</Badge>
          ) : matter.is_fixed ? (
            <Badge color="red">経理確認待ち</Badge>
          ) : (
            <Badge color="blue">申請者編集中</Badge>
          )}
          {matter.has_updates && (
            <Badge color="orange" size="sm">
              更新あり
            </Badge>
          )}
        </div>
      </Group>
      <Text>案件ID: {matter.id}</Text>
      <Text>担当者: {matter.user_name}</Text>
      <Text>分類: {matter.category}</Text>
      <Text>チーム: {matter.team}</Text>
      <Text>合計請求額: {formatCurrency(matter.total_amount)}</Text>
      <Text>合計コスト: {formatCurrency(matter.total_cost)}</Text>
      <Text
        c={`${matter.unchecked_cost_count > 0 && "red"}`}
        fw={`${matter.unchecked_cost_count > 0 ? 700 : 500}`}
      >
        未チェックコスト数: {matter.unchecked_cost_count}
      </Text>
      <Group justify="flex-end" align="center" mt="md">
        <Text c="dimmed" size="xs" tt="uppercase" fw={700}>
          作成日時：{formatTimeToJp(matter.inserted_at)}
        </Text>
      </Group>
      <div className="detail-button-wrapper w-full">
        <Button
          variant="outline"
          className="mt-4"
          fullWidth
          onClick={() => onOpen(matter)}
          size="sm"
        >
          詳細
        </Button>
      </div>
    </Card>
  );
}

export function MatterCard(props: MatterCardProps) {
  if (props.variant === "accounting") {
    return <AccountingMatterCard {...props} />;
  }
  return <UserMatterCard {...props} />;
}
