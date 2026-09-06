"use client";

import {
  Button,
  LoadingOverlay,
  NumberInput,
  Select,
  Table,
  TextInput,
} from "@mantine/core";
import { useAtomValue } from "jotai";
import Link from "next/link";
import { useEffect, useState } from "react";
import { CiSquarePlus } from "react-icons/ci";
import { RiDeleteBin6Line } from "react-icons/ri";
import { optionsAtom } from "@/app/atoms/optionsAtom";
import {
  useBudgetRecurringItemList,
  useSaveBudgetRecurringItems,
} from "@/app/hooks/useBudgetRecurringItemData";
import {
  BudgetRecurringItemInListType,
  BudgetRecurringItemType,
} from "@/app/types/types";
import { categoryOptionsFor } from "@/app/utils/budgetDeclaration";
import {
  getBudgetRecurringItemValidationMessage,
  validateBudgetRecurringItemList,
} from "@/app/utils/budgetRecurringItemValidation";
import { confirmAction } from "@/app/utils/confirmAction";
import { formatEntryType } from "@/app/utils/extraEntry";
import { notifyError, notifySuccess } from "@/app/utils/notify";
import { CustomMonthPicker } from "../CustomMonthPicker";

const ENTRY_TYPE_OPTIONS = [
  { value: "income", label: formatEntryType("income") },
  { value: "expense", label: formatEntryType("expense") },
];

type Props = {
  initialData: BudgetRecurringItemType[];
  // チームリーダーは自チーム固定。経理・管理者は全チームから選択できる
  canEditAllTeams: boolean;
  // teamLocked のときの固定チーム（チームリーダー自身のチーム）。
  // 未設定（プロフィール取得失敗等）の場合、新規行を追加できない
  ownTeam: string | null;
  teamList: string[];
  memberList: { value: string; label: string }[];
  memberListError?: boolean;
};

const toListRows = (
  items: BudgetRecurringItemType[],
): BudgetRecurringItemInListType[] =>
  items.map((item) => ({ ...item, isNew: false, isRemoved: false }));

const BudgetRecurringItemList = ({
  initialData,
  canEditAllTeams,
  ownTeam,
  teamList,
  memberList,
  memberListError = false,
}: Props) => {
  const { categoryList, itemList } = useAtomValue(optionsAtom);
  const { data: recurringItems } = useBudgetRecurringItemList(initialData);
  const saveMutation = useSaveBudgetRecurringItems();

  const [rows, setRows] = useState<BudgetRecurringItemInListType[]>(
    toListRows(initialData),
  );
  // 編集中フラグ。バックグラウンド再取得で保存前の編集内容が黙って
  // 破棄されるのを防ぐ（RecurringCostList と同方針）
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    if (recurringItems && !isDirty) {
      setRows(toListRows(recurringItems));
    }
  }, [recurringItems, isDirty]);

  const handleUpdateRow = (
    id: number,
    updates: Partial<BudgetRecurringItemInListType>,
  ) => {
    setIsDirty(true);
    setRows((prev) =>
      prev.map((row) => (row.id === id ? { ...row, ...updates } : row)),
    );
  };

  const handleAddRow = () => {
    if (!canEditAllTeams && !ownTeam) return;
    const newId =
      rows.length > 0 ? Math.max(...rows.map((row) => row.id)) + 1 : 1;
    const newRow: BudgetRecurringItemInListType = {
      id: newId,
      team: canEditAllTeams ? (teamList[0] ?? "") : (ownTeam as string),
      entry_type: "income",
      category: "",
      description: "",
      amount: 0,
      manager_id: null,
      start_month: "",
      end_month: null,
      display_order: 0,
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
    const validation = validateBudgetRecurringItemList(rows);
    if (validation !== "ok") {
      notifyError(getBudgetRecurringItemValidationMessage(validation));
      return;
    }

    const confirmed = await confirmAction("定期明細を更新しますか？");
    if (!confirmed) return;

    try {
      await saveMutation.mutateAsync(rows);
      setIsDirty(false); // 保存成功後は再取得結果との同期を再開する
      notifySuccess("定期明細を更新しました。");
    } catch {
      // 通知はミューテーションの onError 側で行う
    }
  };

  const visibleRows = rows.filter((row) => !row.isRemoved);

  return (
    <div className="px-4 pb-8 max-w-6xl mx-auto relative">
      <LoadingOverlay visible={saveMutation.isPending} />
      <Link
        href="/budget-declarations"
        className="text-sm text-blue-600 hover:underline"
      >
        ← 事前収支申告一覧に戻る
      </Link>
      <div className="flex justify-between items-center mb-4 mt-2">
        <p className="text-sm text-gray-600">
          毎月固定で発生する収入・支出を登録します。適用期間内の対象月で新規の事前収支申告を作成すると、明細として自動で取り込まれます（取り込み後は申告ごとに編集・削除できます）。金額改定は既存行の適用終了月を設定して打ち切り、新しい行を追加してください。
        </p>
        <Button
          type="button"
          disabled={saveMutation.isPending}
          onClick={handleSave}
        >
          保存
        </Button>
      </div>
      <div className="overflow-x-auto border border-gray-300 rounded bg-slate-50 p-4">
        <Table verticalSpacing="sm" className="whitespace-nowrap">
          <Table.Thead>
            <Table.Tr>
              <Table.Th className="min-w-36">チーム</Table.Th>
              <Table.Th className="min-w-28">種別</Table.Th>
              <Table.Th className="min-w-36">分類</Table.Th>
              <Table.Th className="min-w-44">内容</Table.Th>
              <Table.Th className="min-w-36">金額</Table.Th>
              <Table.Th className="min-w-36">担当者</Table.Th>
              <Table.Th className="min-w-36">適用開始月</Table.Th>
              <Table.Th className="min-w-36">適用終了月</Table.Th>
              <Table.Th className="w-12" />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {visibleRows.map((row) => (
              <Table.Tr key={row.id}>
                <Table.Td>
                  <Select
                    value={row.team || null}
                    data={teamList}
                    disabled={!canEditAllTeams}
                    allowDeselect={false}
                    placeholder="チームを選択"
                    onChange={(selected) =>
                      handleUpdateRow(row.id, { team: selected ?? row.team })
                    }
                  />
                </Table.Td>
                <Table.Td>
                  <Select
                    data={ENTRY_TYPE_OPTIONS}
                    value={row.entry_type}
                    allowDeselect={false}
                    onChange={(value) =>
                      handleUpdateRow(row.id, {
                        entry_type: value ?? "income",
                        // 種別が変わると分類マスタも変わるため入力し直させる
                        category: "",
                      })
                    }
                  />
                </Table.Td>
                <Table.Td>
                  <Select
                    data={categoryOptionsFor(
                      row.entry_type,
                      row.category,
                      categoryList,
                      itemList,
                    )}
                    value={row.category || null}
                    placeholder="分類を選択"
                    onChange={(value) =>
                      handleUpdateRow(row.id, { category: value ?? "" })
                    }
                  />
                </Table.Td>
                <Table.Td>
                  <TextInput
                    value={row.description}
                    placeholder="例: ○○保守契約"
                    onChange={(event) =>
                      handleUpdateRow(row.id, {
                        description: event.target.value,
                      })
                    }
                  />
                </Table.Td>
                <Table.Td>
                  <NumberInput
                    value={row.amount}
                    min={0}
                    step={1000}
                    thousandSeparator=","
                    prefix="¥"
                    onChange={(value) =>
                      handleUpdateRow(row.id, {
                        amount: typeof value === "number" ? value : 0,
                      })
                    }
                  />
                </Table.Td>
                <Table.Td>
                  <Select
                    data={memberList}
                    value={
                      row.manager_id !== null ? String(row.manager_id) : null
                    }
                    placeholder={
                      memberListError
                        ? "担当者一覧を取得できませんでした"
                        : "担当者を選択"
                    }
                    disabled={memberListError}
                    searchable
                    clearable
                    onChange={(value) =>
                      handleUpdateRow(row.id, {
                        manager_id: value ? parseInt(value, 10) : null,
                      })
                    }
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
            定期明細が登録されていません。
          </p>
        )}
        <Button
          type="button"
          fullWidth
          className="mt-4"
          color="dark"
          variant="outline"
          rightSection={<CiSquarePlus />}
          disabled={!canEditAllTeams && !ownTeam}
          onClick={handleAddRow}
        >
          定期明細追加
        </Button>
      </div>
    </div>
  );
};

export default BudgetRecurringItemList;
