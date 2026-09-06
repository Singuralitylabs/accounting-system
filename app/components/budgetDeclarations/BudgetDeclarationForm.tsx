"use client";

import {
  Alert,
  Badge,
  Button,
  Group,
  LoadingOverlay,
  Modal,
  NumberInput,
  Select,
  Table,
  Textarea,
  TextInput,
  Tooltip,
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
  usePreviousBudgetDeclarationItems,
  useSaveBudgetDeclaration,
} from "@/app/hooks/useBudgetDeclarationData";
import { useActiveBudgetRecurringItems } from "@/app/hooks/useBudgetRecurringItemData";
import { BudgetDeclarationItemInput } from "@/app/types/types";
import { confirmAction } from "@/app/utils/confirmAction";
import {
  categoryOptionsFor,
  previousItemsToFormRows,
  summarizeBudgetItems,
} from "@/app/utils/budgetDeclaration";
import {
  getBudgetDeclarationValidationMessage,
  validateBudgetDeclarationPayload,
} from "@/app/utils/budgetDeclarationValidation";
import { ENTRY_TYPE_OPTIONS } from "@/app/utils/extraEntry";
import { formatCurrency, formatMonthLabel } from "@/app/utils/formatter";
import { notifyError } from "@/app/utils/notify";

// fromRecurring は定期明細から自動展開された行かを表す表示用フラグ（バッジ表示のみに使う。
// 保存時は他の項目と同様に通常の明細として送信するため、送信ペイロード組み立て時には含めない）
type ItemRow = BudgetDeclarationItemInput & {
  key: number;
  fromRecurring?: boolean;
};

const emptyItem = (key: number): ItemRow => ({
  key,
  entry_type: "income",
  category: "",
  description: "",
  amount: 0,
  manager_id: null,
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
  // 明細の担当者候補（全メンバー。チーム所属で絞らない。経理追加収支の責任者と同じ方式）
  memberList: { value: string; label: string }[];
  // 担当者候補の取得に失敗したか。true の間は担当者 Select を disabled にする
  // （memberList が空のまま有効にすると、既存明細の manager_id が選択肢に無いため
  // Select が空欄に見え、値は保持されているのに「クリアされた」と誤認しうる）
  memberListError?: boolean;
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
  memberList,
  memberListError = false,
}: Props) => {
  const { teamList, categoryList, itemList } = useAtomValue(optionsAtom);
  const isEditMode = declarationId !== null;
  const teamFieldLocked = teamLocked || isEditMode;

  const {
    data: detail,
    isLoading: isDetailLoading,
    isError: isDetailError,
    isFetching: isDetailFetching,
  } = useBudgetDeclarationDetail(opened ? declarationId : null);

  const saveMutation = useSaveBudgetDeclaration();
  const deleteMutation = useDeleteBudgetDeclaration();
  const isSaving = saveMutation.isPending || deleteMutation.isPending;

  const form = useForm<HeaderFormValues>({
    initialValues: { team, comment: "" },
  });

  // 前月・同チームの申告明細（「前月の明細をコピー」ボタン用）。新規作成時のみ
  // 有効化する（編集時は既存明細の取得完了を待つ必要があり、detail 取得中の
  // 競合を避けるため単純に対象外にする。用途としても、既存申告を編集中に前月を
  // 取り込む場面は薄い）。チーム選択が変わる（経理・管理者の新規作成時）たびに
  // 対象チームを切り替えて再取得する。保存・削除後にキャッシュが古いまま
  // 残らないよう、useBudgetDeclarationDetail と同様にマウントのたび再取得する
  const {
    data: previousItems,
    isLoading: isPreviousItemsLoading,
    isError: isPreviousItemsError,
  } = usePreviousBudgetDeclarationItems(
    opened && !isEditMode,
    targetMonth,
    form.values.team,
  );

  const copyDisabledReason = isPreviousItemsLoading
    ? "前月の申告を確認しています…"
    : isPreviousItemsError
      ? "前月の申告の確認に失敗しました。"
      : !previousItems?.length
        ? "前月の明細がありません。"
        : null;

  // 対象月が適用期間内の定期明細（新規作成時のみ、対象チームの分を自動投入する）。
  // previousItems と同じ理由で新規作成時のみ有効化し、チーム切り替えのたび
  // 対象チームを切り替えて再取得する
  const {
    data: activeRecurringItems,
    isFetching: isActiveRecurringItemsFetching,
    isError: isActiveRecurringItemsError,
  } = useActiveBudgetRecurringItems(
    opened && !isEditMode,
    targetMonth,
    form.values.team,
  );

  // 編集時は既存明細の取得が完了する（detail を受け取る）まで保存を止める。
  // 取得失敗・未完了のまま保存すると、ローカルの items（空のまま）で
  // 明細差し替えが走り、既存明細を消してしまう。
  // isDetailFetching も見るのは、他画面で既にキャッシュされた古い detail が
  // 即座に返りつつ裏で最新化中（refetchOnMount: "always"）の間に、古い内容の
  // まま保存できてしまうと他編集者の変更を消しかねないため
  // （populate effect も同じ理由で isDetailFetching の完了を待つ）。
  // 新規作成時は、対象月が適用期間内の定期明細の取得が終わる（自動投入が
  // 済む）まで保存を止める。取得中に保存できてしまうと、投入されるはずの
  // 定期明細が無いまま申告が作成され、受け入れ基準（自動投入されていること）
  // が満たせない。取得失敗時も同様に止める（成功と誤認して定期明細なしで
  // 作成されるのを防ぐ。エラー時の案内は下記の Alert 参照）
  const saveDisabled =
    isSaving ||
    (isEditMode
      ? !detail || isDetailFetching
      : isActiveRecurringItemsFetching || isActiveRecurringItemsError);

  const [items, setItems] = useState<ItemRow[]>([]);
  const nextKeyRef = useRef(0);
  // detail から items/comment を反映済みの declarationId。編集中に detail が
  // 再取得（保存成功時の invalidate・ウィンドウ再フォーカス等）されても、
  // 同じ申告を反映済みなら上書きしない（入力中の内容を消さないため）
  const populatedForIdRef = useRef<number | null>(null);
  // 定期明細を自動投入済みのチーム。同じチームでの再レンダーでは再投入しない
  // （投入後に利用者がその行を削除しても、無関係な再レンダーで復活させないため）。
  // モーダルを開き直す・チームを変更するたびに null / 新チームへリセットする
  const recurringPopulatedForTeamRef = useRef<string | null>(null);

  // モーダルを開くたび（対象行の切り替え含む）に初期値へ戻す。
  // 編集時は明細取得を待って反映する（既存データを空で上書きしないため）
  useEffect(() => {
    if (!opened) return;
    form.setValues({ team, comment: "" });
    nextKeyRef.current = 0;
    setItems([]);
    populatedForIdRef.current = null;
    recurringPopulatedForTeamRef.current = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened, declarationId, team]);

  // 新規作成時のみ、対象月が適用期間内の定期明細を明細行として自動投入する
  // （案 A: 申告作成時に展開する。既存申告の編集時は展開しない＝二重計上防止）。
  // isActiveRecurringItemsFetching の完了を待つのは populate effect（detail 用）と
  // 同じ理由（取得完了前の空配列で「対象なし」と誤判定しないため）
  useEffect(() => {
    if (!opened || isEditMode) return;
    if (isActiveRecurringItemsFetching) return;
    if (recurringPopulatedForTeamRef.current === form.values.team) return;
    recurringPopulatedForTeamRef.current = form.values.team;
    if (!activeRecurringItems?.length) return;

    const rows = previousItemsToFormRows(activeRecurringItems).map((item) => ({
      ...item,
      key: nextKeyRef.current++,
      fromRecurring: true,
    }));
    setItems((prev) => [...prev, ...rows]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    opened,
    isEditMode,
    activeRecurringItems,
    isActiveRecurringItemsFetching,
    form.values.team,
  ]);

  useEffect(() => {
    if (!opened || !isEditMode || !detail) return;
    // refetchOnMount: "always" により、他画面で先に取得済みの古いキャッシュが
    // 即座に返りつつ裏で再取得中のことがある。取得中のうちに古い内容で
    // populatedForIdRef をセットしてしまうと、直後に届く最新データが
    // 「反映済み」判定でガードされ、古い内容のまま保存できてしまう
    // （lost update）。取得が完全に終わるまで populate 自体を待つ
    if (isDetailFetching) return;
    if (populatedForIdRef.current === declarationId) return;
    populatedForIdRef.current = declarationId;
    form.setValues({ team, comment: detail.comment ?? "" });
    setItems(
      detail.items.map((item) => ({
        key: nextKeyRef.current++,
        entry_type: item.entry_type,
        category: item.category,
        description: item.description,
        amount: item.amount,
        manager_id: item.manager_id,
      })),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened, isEditMode, detail, declarationId, isDetailFetching]);

  const teamOptions = teamList.includes(team) ? teamList : [team, ...teamList];

  const handleAddItem = () => {
    setItems((prev) => [...prev, emptyItem(nextKeyRef.current++)]);
  };

  // チームを変更すると、既に取り込んだ明細が別チームのものとして紛れ込む
  // （前月コピーで担当者ごと別チームの明細一式を持ち込める経路ができたため、
  // 手入力より誤操作の実害が大きい）。明細行がある状態でチームを変えるときは
  // 確認のうえクリアする
  const handleTeamChange = async (value: string | null) => {
    if (!value || value === form.values.team) return;

    if (items.length > 0) {
      const confirmed = await confirmAction(
        "チームを変更すると入力済みの明細はクリアされます。変更しますか？",
      );
      if (!confirmed) return;
      setItems([]);
    }

    form.setFieldValue("team", value);
  };

  // 前月・同チームの明細を現在の明細行の末尾に追加する（未保存状態のまま。
  // コメントはコピー対象に含めない＝前月固有の内容の可能性が高いため）
  const handleCopyPreviousItems = async () => {
    if (!previousItems) return;

    if (items.length > 0) {
      const confirmed = await confirmAction(
        "既に入力済みの明細があります。前月の明細を追記しますか？",
      );
      if (!confirmed) return;
    }

    const rows = previousItemsToFormRows(previousItems).map((item) => ({
      ...item,
      key: nextKeyRef.current++,
    }));
    setItems((prev) => [...prev, ...rows]);
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
        items: items.map(
          ({ entry_type, category, description, amount, manager_id }) => ({
            entry_type,
            category,
            description,
            amount,
            manager_id,
          }),
        ),
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
        <LoadingOverlay
          visible={
            isSaving ||
            (isEditMode
              ? isDetailLoading || isDetailFetching
              : isActiveRecurringItemsFetching)
          }
        />

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

        {!isEditMode && isActiveRecurringItemsError && (
          <Alert
            color="red"
            title="定期明細の確認に失敗しました"
            className="mb-4"
          >
            対象月が適用期間内の定期明細を自動投入できないため、保存を停止しています。時間をおいてもう一度お試しください。
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
            onChange={handleTeamChange}
          />
        </div>

        <Textarea
          className="mt-4"
          label="コメント"
          placeholder="補足があればご記入ください。"
          key={form.key("comment")}
          {...form.getInputProps("comment")}
        />

        {!isEditMode && (
          <Group justify="flex-end" className="mt-4">
            <Tooltip label={copyDisabledReason} disabled={!copyDisabledReason}>
              <span>
                <Button
                  type="button"
                  variant="outline"
                  color="dark"
                  disabled={!!copyDisabledReason}
                  onClick={handleCopyPreviousItems}
                >
                  前月の明細をコピー
                </Button>
              </span>
            </Tooltip>
          </Group>
        )}

        <div className="overflow-x-auto mt-2 border border-gray-300 rounded bg-slate-50 p-4">
          <Table verticalSpacing="sm" className="whitespace-nowrap">
            <Table.Thead>
              <Table.Tr>
                <Table.Th className="w-10" />
                <Table.Th className="min-w-28">種別</Table.Th>
                <Table.Th className="min-w-36">分類</Table.Th>
                <Table.Th className="min-w-44">内容</Table.Th>
                <Table.Th className="min-w-36">金額</Table.Th>
                <Table.Th className="min-w-36">担当者</Table.Th>
                <Table.Th className="w-12" />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {items.map((item) => (
                <Table.Tr key={item.key}>
                  <Table.Td>
                    {item.fromRecurring && (
                      <Tooltip label="定期明細から自動で追加された行です">
                        <Badge size="sm" color="blue" variant="light">
                          定期
                        </Badge>
                      </Tooltip>
                    )}
                  </Table.Td>
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
                      data={categoryOptionsFor(
                        item.entry_type,
                        item.category,
                        categoryList,
                        itemList,
                      )}
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
                    <Select
                      data={memberList}
                      value={
                        item.manager_id !== null
                          ? String(item.manager_id)
                          : null
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
                        handleUpdateItem(item.key, {
                          manager_id: value ? parseInt(value, 10) : null,
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
            <Button
              color="red"
              variant="outline"
              disabled={isSaving}
              onClick={handleDelete}
            >
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
