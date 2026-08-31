"use client";

import {
  Alert,
  Button,
  Group,
  LoadingOverlay,
  Modal,
  NumberInput,
  Select,
  Table,
  Textarea,
  TextInput,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { useAtomValue } from "jotai";
import { useEffect, useRef, useState } from "react";
import { RiDeleteBin6Line } from "react-icons/ri";
import { CiSquarePlus } from "react-icons/ci";
import { optionsAtom } from "@/app/atoms/optionsAtom";
import {
  useBudgetDeclarationDetail,
  useDeleteBudgetDeclaration,
  useSaveBudgetDeclaration,
} from "@/app/hooks/useBudgetDeclarationData";
import { BudgetDeclarationItemInput } from "@/app/types/types";
import { confirmAction } from "@/app/utils/confirmAction";
import { summarizeBudgetItems } from "@/app/utils/budgetDeclaration";
import {
  getBudgetDeclarationValidationMessage,
  validateBudgetDeclarationPayload,
} from "@/app/utils/budgetDeclarationValidation";
import { formatEntryType } from "@/app/utils/extraEntry";
import { formatCurrency, formatMonthLabel } from "@/app/utils/formatter";
import { notifyError } from "@/app/utils/notify";

const ENTRY_TYPE_OPTIONS = [
  { value: "income", label: formatEntryType("income") },
  { value: "expense", label: formatEntryType("expense") },
];

type ItemRow = BudgetDeclarationItemInput & { key: number };

const emptyItem = (key: number): ItemRow => ({
  key,
  entry_type: "income",
  category: "",
  description: "",
  amount: 0,
});

type Props = {
  opened: boolean;
  onClose: () => void;
  targetMonth: string; // "YYYY-MM"（一覧で選択中の月。フォーム内では固定表示）
  team: string; // クリックした行のチーム（初期値）
  declarationId: number | null; // null なら新規作成
  // チーム選択を固定するか（teamleader は自チーム固定。経理・管理者は選択可だが、
  // 編集時は対象月・チームの組み合わせを変えないよう常に固定する）
  teamLocked: boolean;
};

type HeaderFormValues = {
  team: string;
  comment: string;
};

const BudgetDeclarationForm = ({
  opened,
  onClose,
  targetMonth,
  team,
  declarationId,
  teamLocked,
}: Props) => {
  const { teamList, categoryList, itemList } = useAtomValue(optionsAtom);
  const isEditMode = declarationId !== null;
  const teamFieldLocked = teamLocked || isEditMode;

  const {
    data: detail,
    isLoading: isDetailLoading,
    isError: isDetailError,
  } = useBudgetDeclarationDetail(opened ? declarationId : null);

  const saveMutation = useSaveBudgetDeclaration();
  const deleteMutation = useDeleteBudgetDeclaration();
  const isSaving = saveMutation.isPending || deleteMutation.isPending;
  // 編集時は既存明細の取得が完了する（detail を受け取る）まで保存を止める。
  // 取得失敗・未完了のまま保存すると、ローカルの items（空のまま）で
  // 明細差し替えが走り、既存明細を消してしまう
  const saveDisabled = isSaving || (isEditMode && !detail);

  const form = useForm<HeaderFormValues>({
    initialValues: { team, comment: "" },
  });

  const [items, setItems] = useState<ItemRow[]>([]);
  const nextKeyRef = useRef(0);

  // モーダルを開くたび（対象行の切り替え含む）に初期値へ戻す。
  // 編集時は明細取得を待って反映する（既存データを空で上書きしないため）
  useEffect(() => {
    if (!opened) return;
    form.setValues({ team, comment: "" });
    nextKeyRef.current = 0;
    setItems([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened, declarationId, team]);

  useEffect(() => {
    if (!opened || !isEditMode || !detail) return;
    form.setValues({ team, comment: detail.comment ?? "" });
    setItems(
      detail.items.map((item) => ({
        key: nextKeyRef.current++,
        entry_type: item.entry_type,
        category: item.category,
        description: item.description,
        amount: item.amount,
      })),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened, isEditMode, detail]);

  const teamOptions = teamList.includes(team) ? teamList : [team, ...teamList];
  const categoryOptionsFor = (entryType: string) =>
    entryType === "income" ? categoryList : itemList;

  const handleAddItem = () => {
    setItems((prev) => [...prev, emptyItem(nextKeyRef.current++)]);
  };

  const handleRemoveItem = (key: number) => {
    setItems((prev) => prev.filter((item) => item.key !== key));
  };

  const handleUpdateItem = (key: number, updates: Partial<ItemRow>) => {
    setItems((prev) =>
      prev.map((item) => (item.key === key ? { ...item, ...updates } : item)),
    );
  };

  const closeModal = () => {
    if (isSaving) return;
    onClose();
  };

  const handleSave = async () => {
    const currentTeam = form.getValues().team;
    const validation = validateBudgetDeclarationPayload(
      { targetMonth, team: currentTeam },
      items,
    );
    if (!validation.ok) {
      notifyError(getBudgetDeclarationValidationMessage(validation.reason));
      return;
    }

    const confirmed = await confirmAction(
      isEditMode
        ? `${currentTeam}の${formatMonthLabel(targetMonth)}分の事前収支申告を更新しますか？`
        : `${currentTeam}の${formatMonthLabel(targetMonth)}分の事前収支申告を作成しますか？`,
    );
    if (!confirmed) return;

    try {
      await saveMutation.mutateAsync({
        declarationId,
        targetMonth,
        team: currentTeam,
        comment: form.getValues().comment || null,
        items: items.map(({ entry_type, category, description, amount }) => ({
          entry_type,
          category,
          description,
          amount,
        })),
      });
      onClose();
    } catch {
      // 通知はミューテーションの onError 側で行う
    }
  };

  const handleDelete = async () => {
    if (declarationId === null) return;
    const currentTeam = form.getValues().team;
    const confirmed = await confirmAction(
      `${currentTeam}の${formatMonthLabel(targetMonth)}分の事前収支申告を削除しますか？\nこの操作は取り消せません。`,
      { confirmColor: "red" },
    );
    if (!confirmed) return;

    try {
      await deleteMutation.mutateAsync({ declarationId, team: currentTeam });
      onClose();
    } catch {
      // 通知はミューテーションの onError 側で行う
    }
  };

  const summary = summarizeBudgetItems(items);

  return (
    <Modal
      opened={opened}
      onClose={closeModal}
      title={isEditMode ? "事前収支申告の編集" : "事前収支申告の作成"}
      size="xl"
    >
      <div className="relative">
        <LoadingOverlay visible={isSaving || (isEditMode && isDetailLoading)} />

        {isEditMode && isDetailError && (
          <Alert color="red" title="申告の取得に失敗しました" className="mb-4">
            時間をおいてもう一度お試しください。
          </Alert>
        )}

        {isEditMode && !isDetailLoading && !isDetailError && !detail && (
          <Alert color="gray" title="申告が見つかりません" className="mb-4">
            既に削除されている可能性があります。一覧を閉じて再読み込みしてください。
          </Alert>
        )}

        <div className="md:flex gap-4">
          <TextInput
            className="w-full"
            label="対象月"
            value={formatMonthLabel(targetMonth)}
            disabled
          />
          <Select
            className="w-full"
            label="チーム"
            required
            data={teamOptions}
            disabled={teamFieldLocked}
            allowDeselect={false}
            key={form.key("team")}
            {...form.getInputProps("team")}
          />
        </div>

        <Textarea
          className="mt-4"
          label="コメント"
          placeholder="補足があればご記入ください。"
          key={form.key("comment")}
          {...form.getInputProps("comment")}
        />

        <div className="overflow-x-auto mt-4 border border-gray-300 rounded bg-slate-50 p-4">
          <Table verticalSpacing="sm" className="whitespace-nowrap">
            <Table.Thead>
              <Table.Tr>
                <Table.Th className="min-w-28">種別</Table.Th>
                <Table.Th className="min-w-36">分類</Table.Th>
                <Table.Th className="min-w-44">内容</Table.Th>
                <Table.Th className="min-w-36">金額</Table.Th>
                <Table.Th className="w-12" />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {items.map((item) => (
                <Table.Tr key={item.key}>
                  <Table.Td>
                    <Select
                      data={ENTRY_TYPE_OPTIONS}
                      value={item.entry_type}
                      allowDeselect={false}
                      onChange={(value) =>
                        handleUpdateItem(item.key, {
                          entry_type: value ?? "income",
                          // 種別が変わると分類マスタも変わるため入力し直させる
                          category: "",
                        })
                      }
                    />
                  </Table.Td>
                  <Table.Td>
                    <Select
                      data={categoryOptionsFor(item.entry_type)}
                      value={item.category || null}
                      placeholder="分類を選択"
                      onChange={(value) =>
                        handleUpdateItem(item.key, { category: value ?? "" })
                      }
                    />
                  </Table.Td>
                  <Table.Td>
                    <TextInput
                      value={item.description}
                      placeholder="例: ○○受託案件"
                      onChange={(event) =>
                        handleUpdateItem(item.key, {
                          description: event.target.value,
                        })
                      }
                    />
                  </Table.Td>
                  <Table.Td>
                    <NumberInput
                      value={item.amount}
                      min={0}
                      step={1000}
                      thousandSeparator=","
                      prefix="¥"
                      onChange={(value) =>
                        handleUpdateItem(item.key, {
                          amount: typeof value === "number" ? value : 0,
                        })
                      }
                    />
                  </Table.Td>
                  <Table.Td>
                    <button
                      type="button"
                      aria-label="明細を削除"
                      className="text-red-500 hover:text-red-700"
                      onClick={() => handleRemoveItem(item.key)}
                    >
                      <RiDeleteBin6Line size="1.2rem" />
                    </button>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
          {items.length === 0 && (
            <p className="text-center text-gray-500 py-4">
              明細が登録されていません。
            </p>
          )}
          <Button
            type="button"
            fullWidth
            className="mt-4"
            color="dark"
            variant="outline"
            rightSection={<CiSquarePlus />}
            onClick={handleAddItem}
          >
            明細追加
          </Button>
        </div>

        <div className="flex justify-end gap-6 mt-4 text-sm">
          <span>収入合計: {formatCurrency(summary.incomeTotal)}</span>
          <span>支出合計: {formatCurrency(summary.expenseTotal)}</span>
          <span className={summary.balance < 0 ? "text-red-600" : ""}>
            差引: {formatCurrency(summary.balance)}
          </span>
        </div>

        <Group justify="space-between" className="mt-6">
          {isEditMode ? (
            <Button color="red" variant="outline" onClick={handleDelete}>
              削除
            </Button>
          ) : (
            <span />
          )}
          <Group>
            <Button variant="default" onClick={closeModal}>
              キャンセル
            </Button>
            <Button onClick={handleSave} disabled={saveDisabled}>
              保存
            </Button>
          </Group>
        </Group>
      </div>
    </Modal>
  );
};

export default BudgetDeclarationForm;
