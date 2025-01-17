"use client";

import { SimpleGrid } from "@mantine/core";
import { useState, useTransition } from "react";
import { MatterType } from "../types/types";
import { MatterCardDetailModal } from "./modal/MatterCardDetail";
import { useRouter } from "next/navigation";
import { MatterCard } from "./MatterCard";
import deleteMatter from "../utils/deleteMatter";

type Props = {
  matterList: MatterType[] | null;
  teamList: string[];
  categoryList: string[];
  itemList: string[];
  certificateList: string[];
};

export function MatterCardsGrid({
  matterList,
  teamList,
  categoryList,
  itemList,
  certificateList,
}: Props) {
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

  const handleOpenCard = (matter: MatterType) => {
    setMatterInfo(matter);
    setOpened(true);
  };

  const handleCopyCard = (matter: MatterType) => {
    setIsNew(true);
    setMatterInfo({
      ...matter,
      id: 0,
      title: `${matter.title} (コピー)`,
      is_completed: false,
      is_fixed: false,
      inserted_at: new Date().toISOString(),
      accounting_memo: "",
    });
    setOpened(true);
  };

  const handleDeleteCard = async (matter: MatterType) => {
    await deleteMatter(matter);
    refreshData();
  };

  return (
    <div className="py-4 px-8">
      <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="xl">
        {matterList?.map((matter) => (
          <MatterCard
            key={matter.id}
            matter={matter}
            onOpen={handleOpenCard}
            onCopy={handleCopyCard}
            onDelete={handleDeleteCard}
          />
        ))}
      </SimpleGrid>
      {opened && matterInfo && (
        <MatterCardDetailModal
          matterInfo={matterInfo}
          teamList={teamList}
          categoryList={categoryList}
          itemList={itemList}
          certificateList={certificateList}
          opened={opened}
          setOpened={handleModalClose}
          isNew={isNew}
          setIsNew={setIsNew}
        />
      )}
    </div>
  );
}
