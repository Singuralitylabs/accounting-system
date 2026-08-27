"use client";

import { SimpleGrid, Table } from "@mantine/core";
import dynamic from "next/dynamic";
import { useCallback, useMemo, useState } from "react";
import { MatterType } from "../../types/types";
import { LoadingSpinner } from "../LoadingSpinner";
import { MatterCard } from "../MatterCard";
import { useDeleteMatter, useUserMatterList } from "../../hooks/useMatterData";
import {
  confirmAction,
  DELETE_MATTER_CONFIRM_MESSAGE,
} from "../../utils/confirmAction";
import { useListDisplayMode } from "../../hooks/useListDisplayMode";
import TableInfo from "../TableInfo";
import ThreedotsMenu from "../buttons/threedots-menu";
import DisplayMenu from "../buttons/display-menu";
import { useAtomValue } from "jotai";
import { optionsAtom } from "../../atoms/optionsAtom";

// 案件詳細モーダルはフォーム一式（日付ピッカー等）を含み重いため、
// 初期バンドルから外して開くときに読み込む
const MatterCardDetail = dynamic(
  () =>
    import("../modal/MatterCardDetail").then(
      (module) => module.MatterCardDetail,
    ),
  { ssr: false, loading: () => <LoadingSpinner /> },
);

const itemListInUserMatter = [
  "ID",
  "案件名",
  "チーム",
  "分類",
  "合計請求額",
  "取引先数",
  "合計コスト",
  "コスト数",
];

export function UserMatterList({
  initialData,
}: {
  initialData?: MatterType[];
}) {
  // React Queryでデータを管理（初期データ付き）
  const { data: matterList } = useUserMatterList(initialData);

  const [opened, setOpened] = useState(false);
  const [matterInfo, setMatterInfo] = useState<MatterType | null>(null);
  const [isNew, setIsNew] = useState(false);
  const { switchDisplay, setSwitchDisplay, showCards } =
    useListDisplayMode(true);
  const deleteMatterMutation = useDeleteMatter();

  const { teamList, categoryList, itemList, certificateList } =
    useAtomValue(optionsAtom);

  const handleModalClose = useCallback(() => {
    setOpened(false);
  }, []);

  const handleOpenCard = useCallback((matter: MatterType) => {
    setMatterInfo(matter);
    setOpened(true);
  }, []);

  const handleCopyCard = useCallback((matter: MatterType) => {
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
  }, []);

  const handleDeleteCard = useCallback(
    async (matter: MatterType) => {
      const confirmed = await confirmAction(DELETE_MATTER_CONFIRM_MESSAGE, {
        confirmLabel: "削除",
        confirmColor: "red",
      });
      if (!confirmed) return;

      try {
        await deleteMatterMutation.mutateAsync(matter);
      } catch (error) {
        console.error("案件削除に失敗しました:", error);
      }
    },
    [deleteMatterMutation],
  );

  const tableHeads = useMemo(
    () => (
      <Table.Tr key={itemListInUserMatter[0]}>
        {itemListInUserMatter.map((item, index) => (
          <Table.Th key={index} className="whitespace-nowrap px-4 text-center">
            {item}
          </Table.Th>
        ))}
        <Table.Th></Table.Th>
        <Table.Th></Table.Th>
      </Table.Tr>
    ),
    [],
  );

  const tableInfoList = useMemo(
    () =>
      matterList?.map((matter) => (
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
          <TableInfo
            key={matter.id}
            matter={matter}
            itemList={itemListInUserMatter}
          />
          <Table.Td className="whitespace-nowrap px-4">
            <button
              onClick={() => handleOpenCard(matter)}
              className="bg-blue-500 hover:bg-blue-700 px-2 rounded text-white w-full"
            >
              開く
            </button>
          </Table.Td>
          <Table.Td className="flex justify-end">
            <ThreedotsMenu
              matter={matter}
              onCopy={handleCopyCard}
              onDelete={handleDeleteCard}
            />
          </Table.Td>
        </Table.Tr>
      )),
    [matterList, handleOpenCard, handleCopyCard, handleDeleteCard],
  );

  if (!Array.isArray(matterList)) {
    return null;
  }

  return (
    <div>
      <DisplayMenu
        switchDisplay={switchDisplay}
        onSwitchDisplay={setSwitchDisplay}
      />
      {showCards ? (
        <div className="py-4 px-8">
          <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="xl">
            {matterList?.map((matter) => (
              <MatterCard
                key={matter.id}
                variant="user"
                matter={matter}
                onOpen={handleOpenCard}
                onCopy={handleCopyCard}
                onDelete={handleDeleteCard}
              />
            ))}
          </SimpleGrid>
        </div>
      ) : (
        <div className="overflow-auto h-[calc(100vh-200px)]">
          <Table stickyHeader>
            <Table.Thead className="bg-white">{tableHeads}</Table.Thead>
            <Table.Tbody>{tableInfoList}</Table.Tbody>
          </Table>
        </div>
      )}
      {opened && matterInfo && (
        <MatterCardDetail
          variant="user"
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
