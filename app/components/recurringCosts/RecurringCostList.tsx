"use client";

import { RecurringCostInListType, RecurringCostType } from "@/app/types/types";
import { useRecurringCostList } from "@/app/hooks/useRecurringCostData";
import { useUpsertRecurringCost } from "@/app/hooks/useRecurringCostData";
import {
  Button,
  LoadingOverlay,
  NumberInput,
  Select,
  Table,
  TextInput,
} from "@mantine/core";
import { useEffect, useState } from "react";
import { CiSquarePlus } from "react-icons/ci";
import { RiDeleteBin6Line } from "react-icons/ri";
import { ORG_WIDE_TEAM_LABEL } from "@/app/utils/constants";
import { notifyError, notifySuccess } from "@/app/utils/notify";
import { PAYMENT_CYCLE_OPTIONS } from "@/app/utils/paymentCycle";
import { CustomMonthPicker } from "../CustomMonthPicker";

type Props = {
  initialData: RecurringCostType[];
  itemList: string[];
  teamList: string[];
};

const toListRows = (
  recurringCosts: RecurringCostType[],
): RecurringCostInListType[] =>
  recurringCosts.map((rc) => ({ ...rc, isNew: false, isRemoved: false }));

const RecurringCostList = ({ initialData, itemList, teamList }: Props) => {
  const { data: recurringCostList } = useRecurringCostList(initialData);
  const upsertMutation = useUpsertRecurringCost();

  const [rows, setRows] = useState<RecurringCostInListType[]>(
    toListRows(initialData),
  );
  // 編集中フラグ。バックグラウンド再取得（再接続時など）で
  // 保存前の編集内容が黙って破棄されるのを防ぐ
  const [isDirty, setIsDirty] = useState(false);

  // 保存後の再取得などでサーバ状態が変わったらローカル編集状態をリセットする
  // （編集中は同期しない）
  useEffect(() => {
    if (recurringCostList && !isDirty) {
      setRows(toListRows(recurringCostList));
    }
  }, [recurringCostList, isDirty]);

  const handleUpdateRow = (
    id: number,
    updates: Partial<RecurringCostInListType>,
  ) => {
    setIsDirty(true);
    setRows((prev) =>
      prev.map((row) => (row.id === id ? { ...row, ...updates } : row)),
    );
  };

  const handleAddRow = () => {
    const newId =
      rows.length > 0 ? Math.max(...rows.map((row) => row.id)) + 1 : 1;
    const newRow: RecurringCostInListType = {
      id: newId,
      name: "",
      item: "",
      price: 0,
      team: null,
      payment_cycle: "monthly",
      start_month: "",
      end_month: null,
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
      if (!row.name || !row.item || !row.start_month) {
        notifyError("名称・品目・適用開始月は必須です。未入力の欄があります。");
        return;
      }
      if (row.price <= 0) {
        notifyError(`「${row.name}」の支払額を入力してください。`);
        return;
      }
      if (
        row.end_month &&
        row.end_month.slice(0, 7) < row.start_month.slice(0, 7)
      ) {
        notifyError(
          `「${row.name}」の適用終了月が適用開始月より前になっています。`,
        );
        return;
      }
    }

    const confirmed = window.confirm("定期費用の項目を更新しますか？");
    if (!confirmed) return;

    try {
      await upsertMutation.mutateAsync(rows);
      setIsDirty(false); // 保存成功後は再取得結果との同期を再開する
      notifySuccess("定期費用情報を更新しました。");
    } catch (error) {
      console.error("定期費用情報の保存に失敗しました。", error);
      notifyError(
        "定期費用情報の更新に失敗しました。一部のみ反映されている可能性があるため、画面を再読み込みして内容を確認してください。",
      );
    }
  };

  const visibleRows = rows.filter((row) => !row.isRemoved);

  return (
    <div className="px-4 pb-8 max-w-6xl mx-auto relative">
      <LoadingOverlay visible={upsertMutation.isPending} />
      <div className="flex justify-between items-center mb-4">
        <p className="text-sm text-gray-600">
          定期的にかかる管理費を登録します。支払月（適用開始月を起点に支払サイクルごと）の損益計算書に支払額が全額算入されます。
        </p>
        <Button type="button" onClick={handleSave}>
          保存
        </Button>
      </div>
      <div className="overflow-x-auto border border-gray-300 rounded bg-slate-50 p-4">
        <Table verticalSpacing="sm" className="whitespace-nowrap">
          <Table.Thead>
            <Table.Tr>
              <Table.Th className="min-w-44">名称</Table.Th>
              <Table.Th className="min-w-36">品目</Table.Th>
              <Table.Th className="min-w-32">支払額（1回）</Table.Th>
              <Table.Th className="min-w-32">支払サイクル</Table.Th>
              <Table.Th className="min-w-36">チーム</Table.Th>
              <Table.Th className="min-w-36">適用開始月</Table.Th>
              <Table.Th className="min-w-36">適用終了月</Table.Th>
              <Table.Th className="min-w-44">コメント</Table.Th>
              <Table.Th className="w-12" />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {visibleRows.map((row) => (
              <Table.Tr key={row.id}>
                <Table.Td>
                  <TextInput
                    value={row.name}
                    placeholder="例: オフィス家賃"
                    onChange={(event) =>
                      handleUpdateRow(row.id, { name: event.target.value })
                    }
                  />
                </Table.Td>
                <Table.Td>
                  <Select
                    value={row.item || null}
                    placeholder="品目を選択"
                    data={itemList}
                    onChange={(selected) =>
                      handleUpdateRow(row.id, { item: selected ?? "" })
                    }
                    allowDeselect={false}
                  />
                </Table.Td>
                <Table.Td>
                  <NumberInput
                    value={row.price}
                    min={0}
                    step={1000}
                    thousandSeparator=","
                    prefix="¥"
                    onChange={(value) =>
                      handleUpdateRow(row.id, {
                        price: typeof value === "number" ? value : 0,
                      })
                    }
                  />
                </Table.Td>
                <Table.Td>
                  <Select
                    value={row.payment_cycle}
                    data={PAYMENT_CYCLE_OPTIONS}
                    onChange={(selected) =>
                      handleUpdateRow(row.id, {
                        payment_cycle: selected ?? "monthly",
                      })
                    }
                    allowDeselect={false}
                  />
                </Table.Td>
                <Table.Td>
                  <Select
                    value={row.team ?? ORG_WIDE_TEAM_LABEL}
                    data={[ORG_WIDE_TEAM_LABEL, ...teamList]}
                    onChange={(selected) =>
                      handleUpdateRow(row.id, {
                        team:
                          selected === ORG_WIDE_TEAM_LABEL ? null : selected,
                      })
                    }
                    allowDeselect={false}
                  />
                </Table.Td>
                <Table.Td>
                  <CustomMonthPicker
                    placeholder="開始月"
                    value={row.start_month ? row.start_month.slice(0, 7) : null}
                    onChange={(month) =>
                      handleUpdateRow(row.id, {
                        start_month: month ? `${month}-01` : "",
                      })
                    }
                  />
                </Table.Td>
                <Table.Td>
                  <CustomMonthPicker
                    placeholder="終了月（継続中は空欄）"
                    value={row.end_month ? row.end_month.slice(0, 7) : null}
                    onChange={(month) =>
                      handleUpdateRow(row.id, {
                        end_month: month ? `${month}-01` : null,
                      })
                    }
                    isClearable
                  />
                </Table.Td>
                <Table.Td>
                  <TextInput
                    value={row.comment ?? ""}
                    placeholder="備考"
                    onChange={(event) =>
                      handleUpdateRow(row.id, { comment: event.target.value })
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
            定期費用が登録されていません。
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
          定期費用追加
        </Button>
      </div>
    </div>
  );
};

export default RecurringCostList;
