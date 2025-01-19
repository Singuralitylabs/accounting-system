"use client";

import { SimpleGrid, Table } from "@mantine/core";
import { useState, useTransition } from "react";
import { MatterType } from "../types/types";
import { MatterCardDetailModal } from "./modal/MatterCardDetail";
import { useRouter } from "next/navigation";
import { MatterCard } from "./MatterCard";
import deleteMatter from "../utils/deleteMatter";
import { itemListInUserMatter } from "../types/params";
import { FaList } from "react-icons/fa";
import { BiGridAlt } from "react-icons/bi";
import UserTableInfo from "./TableInfo";

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
  const [switchDisplay, setSwitchDisplay] = useState(false);
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

  const tableHeads = (
    <Table.Tr key={itemListInUserMatter[0]}>
      <Table.Th></Table.Th>
      {itemListInUserMatter.map((item, index) => (
        <Table.Th key={index} className="whitespace-nowrap px-4 text-center">
          {item}
        </Table.Th>
      ))}
    </Table.Tr>
  );

  const tableInfoList = matterList?.map((matter) =>
    UserTableInfo({
      matter,
      onOpenCard: handleOpenCard,
      onCopyCard: handleCopyCard,
      onDeleteCard: handleDeleteCard,
    })
  );

  return (
    <div className="py-4 px-8">
      <div className="flex justify-end pb-4 items-center">
        <span className="px-2">表示形式</span>
        <button
          onClick={() => setSwitchDisplay(true)}
          className={`text-lg hover:cursor-pointer w-8 h-8 flex items-center ${
            switchDisplay && `bg-gray-700 text-white`
          } justify-center rounded`}
        >
          <BiGridAlt />
        </button>
        <button
          onClick={() => setSwitchDisplay(false)}
          className={`text-lg hover:cursor-pointer w-8 h-8 flex items-center ${
            !switchDisplay && `bg-gray-700 text-white`
          } justify-center rounded`}
        >
          <FaList />
        </button>
      </div>
      {switchDisplay ? (
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
      ) : (
        <div className="overflow-auto h-[calc(100vh-200px)]">
          <Table stickyHeader>
            <Table.Thead className="bg-white">{tableHeads}</Table.Thead>
            <Table.Tbody>{tableInfoList}</Table.Tbody>
          </Table>
        </div>
      )}
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
