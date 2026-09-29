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
import {
  ORG_WIDE_TEAM_LABEL,
  teamFromLabel,
  teamLabel,
} from "@/app/utils/constants";
import { notifyError, notifySuccess } from "@/app/utils/notify";
import { confirmAction } from "@/app/utils/confirmAction";
import { PAYMENT_CYCLE_OPTIONS } from "@/app/utils/paymentCycle";
import { CustomMonthPicker } from "../CustomMonthPicker";
import { SaveRefreshAlert } from "../SaveRefreshAlert";
import { useSaveRefreshLock } from "@/app/hooks/useSaveRefreshLock";
import { useClosedMonths } from "@/app/hooks/useClosedMonths";
import { closedMonthsInRecurringRange } from "@/app/utils/profitLossClosing";
import { formatMonthLabel } from "@/app/utils/formatter";

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
  const {
    data: recurringCostList,
    isInvalidated,
    isFetching,
    isError,
    isPaused,
    refetch,
  } = useRecurringCostList(initialData);
  const upsertMutation = useUpsertRecurringCost();
  // 損益計算書で確定済みの月（Issue #148）。定期費用マスタは確定済みの月があっても
  // 編集できるが、確定済みの月の損益計算書（確定値）には反映されないため注記する
  const { closedMonths } = useClosedMonths();

  const [rows, setRows] = useState<RecurringCostInListType[]>(
    toListRows(initialData),
  );
  // 編集中フラグ。バックグラウンド再取得（再接続時など）で
  // 保存前の編集内容が黙って破棄されるのを防ぐ
  const [isDirty, setIsDirty] = useState(false);
  // 保存後（保存の失敗で一部だけ反映された可能性があるときも）と、無効化された一覧を
  // 取り直せるまでのロック。追加・更新・削除は並列に送るため、失敗時は一部だけ反映されている
  // （または応答だけ失われて反映済みの）可能性があり、そのまま保存し直すと新規行が二重に
  // 登録されうる。再取得に成功して無効化が解けるまで同期と編集・保存を止め、取り直した一覧
  // （実際の状態）に同期する。再取得待ちのまま画面を離れて戻った場合も、キャッシュに残る
  // 無効化で止まる（Issue #170, #190）
  const {
    locked: needsReload,
    isStalled: reloadStalled,
    outcome: saveOutcome,
    markSaved,
  } = useSaveRefreshLock({ isInvalidated, isFetching, isError, isPaused });
  const formLocked = upsertMutation.isPending || needsReload;

  // 保存後の再取得などでサーバ状態が変わったらローカル編集状態をリセットする
  // （編集中・保存後の再取得待ちは同期しない）
  useEffect(() => {
    if (recurringCostList && !isDirty && !needsReload) {
      setRows(toListRows(recurringCostList));
    }
  }, [recurringCostList, isDirty, needsReload]);

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

    const confirmed = await confirmAction("定期費用の項目を更新しますか？");
    if (!confirmed) return;

    try {
      await upsertMutation.mutateAsync(rows);
      // 保存後の再取得（フックの onSuccess で無効化済み）が届くまで、保存前のキャッシュで
      // 画面を上書きせず、保存した内容を表示したまま編集・保存を止める
      markSaved("saved");
      setIsDirty(false);
      notifySuccess("定期費用情報を更新しました。");
    } catch (error) {
      console.error("定期費用情報の保存に失敗しました。", error);
      markSaved("unknown");
      setIsDirty(false);
      notifyError(
        "定期費用情報の更新に失敗しました。一部のみ反映されている可能性があるため、最新の内容を取得して表示します。反映されていない変更は入力し直してください。",
      );
    }
  };

  const visibleRows = rows.filter((row) => !row.isRemoved);

  return (
    <div className="px-4 pb-8 max-w-6xl mx-auto relative">
      <LoadingOverlay
        visible={upsertMutation.isPending || (needsReload && isFetching)}
      />
      {reloadStalled && (
        <SaveRefreshAlert
          subject="定期費用情報"
          outcome={saveOutcome}
          isPaused={isPaused}
          onReload={() => refetch()}
        />
      )}
      <div className="flex justify-between items-center mb-4 gap-4">
        <p className="text-sm text-gray-600">
          定期的にかかる管理費を登録します。支払月（適用開始月を起点に支払サイクルごと）の損益計算書に支払額が全額算入されます。損益計算書で確定済みの月には変更が反映されません（反映するには損益計算書でその月の「確定済み」をオフにしてから再度オンにします）。
        </p>
        <Button
          type="button"
          className="shrink-0"
          disabled={formLocked}
          onClick={handleSave}
        >
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
            {visibleRows.map((row) => {
              const closedInRange = row.start_month
                ? closedMonthsInRecurringRange(row, closedMonths)
                : [];
              return (
                <Table.Tr key={row.id}>
                  <Table.Td>
                    <TextInput
                      value={row.name}
                      placeholder="例: オフィス家賃"
                      description={
                        closedInRange.length > 0
                          ? `確定済みの月（${formatMonthLabel(closedInRange[0])}〜）の損益計算書には反映されません`
                          : undefined
                      }
                      inputWrapperOrder={[
                        "label",
                        "input",
                        "description",
                        "error",
                      ]}
                      disabled={formLocked}
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
                      disabled={formLocked}
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
                      disabled={formLocked}
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
                      disabled={formLocked}
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
                      value={teamLabel(row.team)}
                      data={[ORG_WIDE_TEAM_LABEL, ...teamList]}
                      disabled={formLocked}
                      onChange={(selected) =>
                        handleUpdateRow(row.id, {
                          team: teamFromLabel(selected),
                        })
                      }
                      allowDeselect={false}
                    />
                  </Table.Td>
                  <Table.Td>
                    <CustomMonthPicker
                      placeholder="開始月"
                      disabled={formLocked}
                      value={
                        row.start_month ? row.start_month.slice(0, 7) : null
                      }
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
                      disabled={formLocked}
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
                      disabled={formLocked}
                      onChange={(event) =>
                        handleUpdateRow(row.id, { comment: event.target.value })
                      }
                    />
                  </Table.Td>
                  <Table.Td>
                    <button
                      type="button"
                      aria-label="削除"
                      className="text-red-500 hover:text-red-700 disabled:text-gray-300 disabled:cursor-not-allowed"
                      disabled={formLocked}
                      onClick={() => handleRemoveRow(row.id)}
                    >
                      <RiDeleteBin6Line size="1.2rem" />
                    </button>
                  </Table.Td>
                </Table.Tr>
              );
            })}
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
          disabled={formLocked}
          onClick={handleAddRow}
        >
          定期費用追加
        </Button>
      </div>
    </div>
  );
};

export default RecurringCostList;
