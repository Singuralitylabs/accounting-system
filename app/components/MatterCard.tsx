"use client";

import { Card, Text, Badge, Group, Container, SimpleGrid } from "@mantine/core";
import { useState } from "react";
import { MatterType } from "../types/types";
import { MatterCardDetailModal } from "./modal/MatterCardDetail";

export function MatterCardsGrid({
  matterList,
}: {
  matterList: MatterType[] | null;
}) {
  const [opened, setOpened] = useState(false);
  const [matterInfo, setMatterInfo] = useState<MatterType | null>(null);

  if (!Array.isArray(matterList)) {
    return null;
  }

  const openCard = (matter: MatterType) => {
    setMatterInfo(matter);
    setOpened(true);
  };

  const formatCurrency = (amount: number | null) => {
    if (amount === null || amount === undefined) return "-";
    return new Intl.NumberFormat("ja-JP", {
      style: "currency",
      currency: "JPY",
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const cards = matterList?.map((matter) => {
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

    return (
      <Card
        key={matter.id}
        p="md"
        radius="md"
        component="a"
        className="hover:bg-transparent hover:cursor-pointer hover:bg-gray-100 border transition relative"
        shadow="sm"
        onClick={() => openCard(matter)}
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
          <div className="absolute top-5 right-5">
            {matter.is_completed ? (
              <Badge color="green">経理確認完了</Badge>
            ) : matter.is_fixed ? (
              <Badge color="blue">経理確認待ち</Badge>
            ) : (
              <Badge color="red">申請者編集中</Badge>
            )}
          </div>
        </Group>
        <Text>案件ID :{matter.id}</Text>
        <Text>分類 :{matter.category}</Text>
        <Text>チーム :{matter.team}</Text>
        <Text>合計請求額 :{formatCurrency(matter.total_amount)}</Text>
        <Text>合計コスト :{formatCurrency(matter.total_cost)}</Text>
        <Text
          c="dimmed"
          size="xs"
          tt="uppercase"
          fw={700}
          mt="md"
          className="flex justify-end"
        >
          作成日時：{formattedDate}
        </Text>
      </Card>
    );
  });

  return (
    <Container py="xl">
      <SimpleGrid cols={{ base: 1, sm: 2 }}>{cards}</SimpleGrid>
      {opened && matterInfo ? (
        <MatterCardDetailModal
          matterInfo={matterInfo}
          opened={opened}
          setOpened={setOpened}
        />
      ) : null}
    </Container>
  );
}
