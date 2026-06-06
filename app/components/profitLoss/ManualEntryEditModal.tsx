"use client";

import { optionsAtom } from "@/app/atoms/optionsAtom";
import {
  useManualEntryList,
  useUpsertManualEntry,
} from "@/app/hooks/useManualEntryData";
import { ManualEntryInListType, ManualEntryType } from "@/app/types/types";
import { ORG_WIDE_TEAM_LABEL } from "@/app/utils/constants";
import { formatMonthLabel } from "@/app/utils/formatter";
import { ENTRY_TYPE_OPTIONS } from "@/app/utils/manualEntry";
import {
  Button,
  LoadingOverlay,
  Modal,
  NumberInput,
  Select,
  Table,
  TextInput,
} from "@mantine/core";
import { useAtomValue } from "jotai";
import { useEffect, useState } from "react";
import { CiSquarePlus } from "react-icons/ci";
import { RiDeleteBin6Line } from "react-icons/ri";
import { LoadingSpinner } from "../LoadingSpinner";

type Props = {
  month: string; // "YYYY-MM"（計上月。モーダル内では変更不可）
  opened: boolean;
  onClose: () => void;
};

const toListRows = (
  manualEntries: ManualEntryType[],
): ManualEntryInListType[] =>
  manualEntries.map((entry) => ({ ...entry, isNew: false, isRemoved: false }));

const ManualEntryEditModal = ({ month, opened, onClose }: Props) => {
  const { categoryList, itemList, teamList } = useAtomValue(optionsAtom);

  // モーダルを開いたタイミングで対象月の最新一覧を取得する
  const { data: manualEntryList, isLoading } = useManualEntryList(
    month,
    opened,
  );
  const upsertMutation = useUpsertManualEntry();

  const [rows, setRows] = useState<ManualEntryInListType[]>([]);
  // 編集中フラグ。バックグラウンド再取得（再接続時など）で
  // 保存前の編集内容が黙って破棄されるのを防ぐ
  const [isDirty, setIsDirty] = useState(false);

  // モーダルを開き直したとき・保存後の再取得時にローカル編集状態をリセットする
  // （編集中は同期しない）
  useEffect(() => {
    if (manualEntryList && !isDirty) {
      setRows(toListRows(manualEntryList));
    }
  }, [manualEntryList, isDirty]);

  // 月を切り替えてモーダルを開いたときに前の月の編集状態が残らないようにする
  useEffect(() => {
    if (opened) {
      setIsDirty(false);
    }
  }, [opened, month]);

  const handleUpdateRow = (
    id: number,
    updates: Partial<ManualEntryInListType>,
  ) => {
    setIsDirty(true);
    setRows((prev) =>
      prev.map((row) => (row.id === id ? { ...row, ...updates } : row)),
    );
  };

  const handleAddRow = () => {
    const newId =
      rows.length > 0 ? Math.max(...rows.map((row) => row.id)) + 1 : 1;
    const newRow: ManualEntryInListType = {
      id: newId,
      entry_type: "revenue",
      name: "",
      category: null,
      item: null,
      amount: 0,
      team: null,
      target_month: `${month}-01`,
      comment: null,
      inserted_at: "",
      updated_at: "",
      isNew: true,
      isRemoved: false,
    };
    setIsDirty(true);
    setRows((prev) => [...prev, newRow]);
  };

  const handleRemoveRow = (id: number) => {
    setIsDirty(true);
    setRows((prev) =>
      prev.map((row) => (row.id === id ? { ...row, isRemoved: true } : row)),
    );
  };

  const handleSave = async () => {
    const activeRows = rows.filter((row) => !row.isRemoved);
    for (const row of activeRows) {
      if (!row.name) {
        alert("名称は必須です。未入力の欄があります。");
        return;
      }
      if (row.entry_type === "revenue" && !row.category) {
        alert(`「${row.name}」の分類を選択してください。`);
        return;
      }
      if (row.entry_type === "cost" && !row.item) {
        alert(`「${row.name}」の品目を選択してください。`);
        return;
      }
      if (row.amount === 0) {
        alert(
          `「${row.name}」の金額を入力してください（0 は登録できません）。`,
        );
        return;
      }
    }

    const confirmed = window.confirm(
      `${formatMonthLabel(month)}の案件外収支を更新しますか？`,
    );
    if (!confirmed) return;

    try {
      await upsertMutation.mutateAsync({ month, manualEntries: rows });
      setIsDirty(false); // 保存成功後は再取得結果との同期を再開する
      alert("案件外収支情報を更新しました。");
      onClose();
    } catch (error) {
      console.error("案件外収支情報の保存に失敗しました。", error);
      alert(
        "案件外収支情報の更新に失敗しました。一部のみ反映されている可能性があるため、画面を再読み込みして内容を確認してください。",
      );
    }
  };

  const handleClose = () => {
    setIsDirty(false); // 破棄して閉じる（次回オープン時に最新一覧へ同期する）
    onClose();
  };

  const visibleRows = rows.filter((row) => !row.isRemoved);

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      title={`案件外収支の編集（${formatMonthLabel(month)}）`}
      size="70rem"
    >
      <div className="relative">
        <LoadingOverlay visible={upsertMutation.isPending} />
        <p className="text-sm text-gray-600 mb-4">
          案件に紐づかない売上・費用を登録します。計上月は
          {formatMonthLabel(month)}
          に固定され、マイナス金額（減額調整）も登録できます。
        </p>
        {isLoading ? (
          <LoadingSpinner />
        ) : (
          <div className="overflow-x-auto border border-gray-300 rounded bg-slate-50 p-4">
            <Table verticalSpacing="sm" className="whitespace-nowrap">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th className="min-w-28">種別</Table.Th>
                  <Table.Th className="min-w-44">名称</Table.Th>
                  <Table.Th className="min-w-36">分類 / 品目</Table.Th>
                  <Table.Th className="min-w-32">金額</Table.Th>
                  <Table.Th className="min-w-36">チーム</Table.Th>
                  <Table.Th className="min-w-44">コメント</Table.Th>
                  <Table.Th className="w-12" />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {visibleRows.map((row) => (
                  <Table.Tr key={row.id}>
                    <Table.Td>
                      <Select
                        value={row.entry_type}
                        data={ENTRY_TYPE_OPTIONS}
                        onChange={(selected) =>
                          // 種別を切り替えたら分類・品目を選び直す
                          handleUpdateRow(row.id, {
                            entry_type: selected ?? "revenue",
                            category: null,
                            item: null,
                          })
                        }
                        allowDeselect={false}
                      />
                    </Table.Td>
                    <Table.Td>
                      <TextInput
                        value={row.name}
                        placeholder="例: 協賛金収入"
                        onChange={(event) =>
                          handleUpdateRow(row.id, { name: event.target.value })
                        }
                      />
                    </Table.Td>
                    <Table.Td>
                      {row.entry_type === "revenue" ? (
                        <Select
                          value={row.category}
                          placeholder="分類を選択"
                          data={categoryList}
                          onChange={(selected) =>
                            handleUpdateRow(row.id, { category: selected })
                          }
                          allowDeselect={false}
                        />
                      ) : (
                        <Select
                          value={row.item}
                          placeholder="品目を選択"
                          data={itemList}
                          onChange={(selected) =>
                            handleUpdateRow(row.id, { item: selected })
                          }
                          allowDeselect={false}
                        />
                      )}
                    </Table.Td>
                    <Table.Td>
                      <NumberInput
                        value={row.amount}
                        step={1000}
                        thousandSeparator=","
                        prefix="¥"
                        // マイナス金額（減額調整）を許容するため min は設定しない
                        onChange={(value) =>
                          handleUpdateRow(row.id, {
                            amount: typeof value === "number" ? value : 0,
                          })
                        }
                      />
                    </Table.Td>
                    <Table.Td>
                      <Select
                        value={row.team ?? ORG_WIDE_TEAM_LABEL}
                        data={[ORG_WIDE_TEAM_LABEL, ...teamList]}
                        onChange={(selected) =>
                          handleUpdateRow(row.id, {
                            team:
                              selected === ORG_WIDE_TEAM_LABEL
                                ? null
                                : selected,
                          })
                        }
                        allowDeselect={false}
                      />
                    </Table.Td>
                    <Table.Td>
                      <TextInput
                        value={row.comment ?? ""}
                        placeholder="備考"
                        onChange={(event) =>
                          handleUpdateRow(row.id, {
                            comment: event.target.value,
                          })
                        }
                      />
                    </Table.Td>
                    <Table.Td>
                      <button
                        type="button"
                        aria-label="削除"
                        className="text-red-500 hover:text-red-700"
                        onClick={() => handleRemoveRow(row.id)}
                      >
                        <RiDeleteBin6Line size="1.2rem" />
                      </button>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
            {visibleRows.length === 0 && (
              <p className="text-center text-gray-500 py-6">
                この月の案件外収支は登録されていません。
              </p>
            )}
            <Button
              type="button"
              fullWidth
              className="mt-4"
              color="dark"
              variant="outline"
              rightSection={<CiSquarePlus />}
              onClick={handleAddRow}
            >
              エントリ追加
            </Button>
          </div>
        )}
        <div className="flex justify-end gap-2 mt-4">
          <Button type="button" variant="default" onClick={handleClose}>
            キャンセル
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={isLoading || upsertMutation.isPending}
          >
            保存
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default ManualEntryEditModal;
