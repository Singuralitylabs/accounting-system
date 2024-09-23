import {
  Card,
  Text,
  Badge,
  Button,
  Group,
  Container,
  SimpleGrid,
} from "@mantine/core";
import { Database } from "../lib/database.types";

type MattersTable = Database["public"]["Tables"]["matters"];
type MattersRow = MattersTable["Row"];

export function MatterCardsGrid({
  matterList,
}: {
  matterList: MattersRow[] | null;
}) {
  const cards = matterList?.map((matter) => (
    <Card
      key={matter.name}
      p="md"
      radius="md"
      component="a"
      className="hover:bg-transparent hover:cursor-pointer hover:bg-gray-100 border transition"
      shadow="sm"
      //   onClick={() => openCard(matter)}
    >
      <Group justify="space-between" align="flex-start">
        <Text fw={700} size="lg" mt={5}>
          {matter.name}
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
    </Container>
  );
}
