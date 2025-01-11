"use client";

import { Container, SimpleGrid } from "@mantine/core";
import { useState, useTransition } from "react";
import { MatterType } from "../types/types";
import { MatterCardDetailModal } from "./modal/MatterCardDetail";
import { useRouter } from "next/navigation";
import { MatterCard } from "./MatterCard";

export function MatterCardsGrid({
  matterList,
}: {
  matterList: MatterType[] | null;
}) {
  const [opened, setOpened] = useState(false);
  const [matterInfo, setMatterInfo] = useState<MatterType | null>(null);
  const [isNew, setIsNew] = useState(false);
  const router = useRouter();
  const [_, startTransition] = useTransition();

  const refreshData = () => {
    startTransition(() => {
      router.refresh();
    });
  };

  const handleModalClose = () => {
    setOpened(false);
    refreshData();
  };

  if (!Array.isArray(matterList)) {
    return null;
  }

  const openCard = (matter: MatterType) => {
    setMatterInfo(matter);
    setOpened(true);
  };

  const copyCard = (matter: MatterType) => {
    setIsNew(true);
    setMatterInfo({
      ...matter,
      title: `${matter.title} (コピー)`,
      is_completed: false,
      is_fixed: false,
      inserted_at: new Date().toISOString(),
      accounting_memo: "",
    });
    setOpened(true);
  };
  const deleteCard = (matter: MatterType) => {};

  return (
    <Container py="xl">
      <SimpleGrid cols={{ base: 1, sm: 2 }}>
        {matterList?.map((matter) => (
          <MatterCard
            matter={matter}
            onOpen={openCard}
            onCopy={copyCard}
            onDelete={deleteCard}
          />
        ))}
      </SimpleGrid>
      {opened && matterInfo && (
        <MatterCardDetailModal
          matterInfo={matterInfo}
          opened={opened}
          setOpened={handleModalClose}
          isNew={isNew}
          setIsNew={setIsNew}
        />
      )}
    </Container>
  );
}
