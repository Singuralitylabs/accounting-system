import { Button, Card, Text, Badge, Group } from "@mantine/core";
import { MatterInfoWithUserNameType } from "../types/types";

type Props = {
  matter: MatterInfoWithUserNameType;
  onOpen: (matter: MatterInfoWithUserNameType) => void;
};

export function MatterCardForAccounting({ matter, onOpen }: Props) {
  const formattedDate = new Date(matter.inserted_at).toLocaleDateString(
    "ja-JP",
    {
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
    }
  );

  const formatCurrency = (amount: number | null) => {
    if (amount === null || amount === undefined) return "-";
    return new Intl.NumberFormat("ja-JP", {
      style: "currency",
      currency: "JPY",
      minimumFractionDigits: 0,
    }).format(amount);
  };

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
          作成日時：{formattedDate}
        </Text>
      </Group>
      <Button
        variant="outline"
        className="mt-4"
        onClick={() => onOpen(matter)}
        size="sm"
      >
        詳細
      </Button>
    </Card>
  );
}
