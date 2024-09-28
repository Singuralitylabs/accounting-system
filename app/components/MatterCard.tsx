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

  const openCard = (matter: MatterType) => {
    setMatterInfo(matter);
    setOpened(true);
  };
  const cards = matterList?.map((matter) => (
    <Card
      key={matter.id}
      p="md"
      radius="md"
      component="a"
      className="hover:bg-transparent hover:cursor-pointer hover:bg-gray-100 border transition"
      shadow="sm"
      onClick={() => openCard(matter)}
    >
      <Group justify="space-between" align="flex-start">
        <Text fw={700} size="lg" mt={5}>
          {matter.title}
        </Text>
        {matter.is_fixed ? (
          <Badge color="blue">確定</Badge>
        ) : (
          <Badge color="red">未確定</Badge>
        )}
      </Group>
      <Text className="">分類：{matter.category}</Text>
      <Text className="">金額：{matter.amount}円</Text>
      <Text c="dimmed" size="xs" tt="uppercase" fw={700} mt="md">
        {matter.inserted_at}
      </Text>
    </Card>
  ));

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
