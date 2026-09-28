"use client";

import { ExtraEntryInListType, ExtraEntryType } from "@/app/types/types";
import {
  ExtraEntryValidationError,
  ExtraEntrySuggestion,
  useExtraEntryList,
  useExtraEntrySuggestions,
  useUpsertExtraEntry,
} from "@/app/hooks/useExtraEntryData";
import { useClosedMonths } from "@/app/hooks/useClosedMonths";
import {
  CLOSED_MONTH_LOCK_MESSAGE,
  findExtraEntryLockViolations,
  isClosedMonth,
} from "@/app/utils/profitLossClosing";
import {
  ORG_WIDE_TEAM_LABEL,
  teamFromLabel,
  teamLabel,
} from "@/app/utils/constants";
import { selectChangedExtraEntries } from "@/app/utils/extraEntry";
import { toFirstOfMonth } from "@/app/utils/formatter";
import { notifyError, notifySuccess } from "@/app/utils/notify";
import { confirmAction } from "@/app/utils/confirmAction";
import {
  Alert,
  Autocomplete,
  Badge,
  Button,
  LoadingOverlay,
  NumberInput,
  Select,
  Table,
  TextInput,
  Title,
  Tooltip,
} from "@mantine/core";
import { useEffect, useMemo, useState } from "react";
import { CiSquarePlus } from "react-icons/ci";
import { RiDeleteBin6Line } from "react-icons/ri";
import { CustomDatePicker } from "../CustomDatePicker";
import { CustomMonthPicker } from "../CustomMonthPicker";

type Props = {
  initialMonth: string; // "YYYY-MM"
  initialData: ExtraEntryType[];
  initialDataUpdatedAt: number; // サーバで initialData を取得した時刻（epoch ms）
  incomeCategoryList: string[];
  expenseCategoryList: string[];
  paymentMethodList: string[];
  teamList: string[];
  // 内容・請求先のサジェスト用の過去の入力値（直近12ヶ月＋月未確定分）
  initialSuggestions: ExtraEntrySuggestion[];
  memberList: { value: string; label: string }[];
};

const toListRows = (extraEntries: ExtraEntryType[]): ExtraEntryInListType[] =>
  extraEntries.map((entry) => ({ ...entry, isNew: false, isRemoved: false }));

const toRowMap = (extraEntries: ExtraEntryType[]) =>
  new Map(extraEntries.map((entry) => [entry.id, entry]));

// 入力済みの値から重複なしのサジェスト候補を作る（内容・請求先の入力補助用）
const toSuggestions = (values: (string | null)[]): string[] =>
  Array.from(new Set(values.filter((value): value is string => !!value)));

const ExtraEntryList = ({
  initialMonth,
  initialData,
  initialDataUpdatedAt,
  incomeCategoryList,
  expenseCategoryList,
  paymentMethodList,
  teamList,
  initialSuggestions,
  memberList,
}: Props) => {
  // 対象月（`?month=` で引き継いだ月または当月）。一覧には対象月のエントリと
  // 月未確定（entry_date が NULL）のエントリだけを表示する
  const [month, setMonth] = useState<string>(initialMonth);
  const {
    data: extraEntryList,
    isError,
    isPlaceholderData,
    isFetching,
    isStale,
    isPaused,
    isInvalidated,
    dataUpdatedAt,
    getDataUpdatedAt,
    refetch,
  } = useExtraEntryList(
    month,
    month === initialMonth ? initialData : undefined,
    month === initialMonth ? initialDataUpdatedAt : undefined,
  );
  const upsertMutation = useUpsertExtraEntry();
  // 確定済みの月（損益計算書の月次収支確定。Issue #148）のエントリは編集・削除できず、
  // 確定済みの月の日付も選べない（DB の RLS でも拒否される）
  const {
    closedMonths,
    isLoading: isClosedLoading,
    isError: isClosedError,
  } = useClosedMonths();
  // 月切替中（新しい月の取得中）は前月の行を残したまま、編集・保存できないようにする。
  // キャッシュ済みの stale な月への切替では placeholder を経由しないため、
  // 再取得が終わるまで（isFetching && isStale）もロックする
  const isSwitchingMonth = isPlaceholderData || (isFetching && isStale);
  // 保存に成功した時点の対象月と一覧の取得時刻。保存後の再取得で新しい一覧が届くまでは
  // 保存前の古い一覧で画面を上書きせず、保存した内容を表示したままにする（Issue #170）
  const [savedSnapshot, setSavedSnapshot] = useState<{
    month: string;
    dataUpdatedAt: number;
  } | null>(null);
  const isAwaitingRefresh =
    savedSnapshot !== null &&
    savedSnapshot.month === month &&
    savedSnapshot.dataUpdatedAt === dataUpdatedAt;
  // 無効化された一覧（保存・確定などで古いと分かっている）を取り直せないまま表示している。
  // 月を切り替えて戻った・画面を開き直した場合も含め、二重登録や上書きを防ぐため
  // 最新の一覧を取得できるまで編集・保存を止め、再読み込みを促す（Issue #170）
  const isOutdated =
    (isInvalidated || isAwaitingRefresh) &&
    !isFetching &&
    (isError || isPaused);
  const isMonthClosed = isClosedMonth(closedMonths, month);
  // 確定済みの月の情報がまだ無い（取得中・取得失敗）間は、確定済みか判定できない
  // ため追加ボタンを無効にする（保存はロック判定・RLS で拒否されるが、仕様どおり
  // 確定済みの月では押せないようにする）
  const isClosedUnknown = isClosedLoading || isClosedError;
  // 切替中・保存中・保存後の再取得待ちはすべての入力を無効化する。
  // 再取得待ちの間の行には保存済みの新規行（isNew のまま）が含まれるため、
  // 再度保存すると二重に登録されてしまう
  const formLocked =
    isSwitchingMonth ||
    upsertMutation.isPending ||
    isAwaitingRefresh ||
    isOutdated;
  // 追加は対象月が確定済みでなく、確定済みかが判明し、ロックされていないときだけ
  const canAddRow = !isMonthClosed && !isClosedUnknown && !formLocked;
  // 最新の保存済みの行（編集ロックは変更前の日付で判定する）
  const originals = useMemo(
    () => toRowMap(extraEntryList ?? initialData),
    [extraEntryList, initialData],
  );
  const isRowLocked = (row: ExtraEntryInListType) =>
    !row.isNew &&
    isClosedMonth(closedMonths, originals.get(row.id)?.entry_date);

  const [rows, setRows] = useState<ExtraEntryInListType[]>(
    toListRows(initialData),
  );
  // 編集を始めた時点（画面に読み込んだ時点）の保存済みの行。保存時は、これと比べて
  // 追加・削除・編集した行だけを送る（編集していない行を読み込み時点の値で上書きしない）
  const [baseline, setBaseline] = useState(() => toRowMap(initialData));
  // 編集中フラグ。バックグラウンド再取得（再接続時など）で
  // 保存前の編集内容が黙って破棄されるのを防ぐ
  const [isDirty, setIsDirty] = useState(false);

  // 保存後の再取得などでサーバ状態が変わったらローカル編集状態をリセットする
  // （編集中・月切替中・保存後の再取得待ちは同期しない）
  useEffect(() => {
    if (extraEntryList && !isDirty && !isSwitchingMonth && !isAwaitingRefresh) {
      setRows(toListRows(extraEntryList));
      setBaseline(toRowMap(extraEntryList));
    }
  }, [extraEntryList, isDirty, isSwitchingMonth, isAwaitingRefresh]);

  const visibleRows = rows.filter((row) => !row.isRemoved);
  const incomeRows = visibleRows.filter((row) => row.entry_type === "income");
  const expenseRows = visibleRows.filter((row) => row.entry_type === "expense");

  // 内容・請求先のサジェスト候補（直近12ヶ月＋月未確定分の過去の入力値と、
  // 編集中の行も含めた表示中の行の入力値）
  const { data: suggestionEntries } =
    useExtraEntrySuggestions(initialSuggestions);
  const descriptionSuggestions = useMemo(
    () =>
      toSuggestions([
        ...(suggestionEntries ?? []).map((row) => row.description),
        ...visibleRows.map((row) => row.description),
      ]),
    [suggestionEntries, visibleRows],
  );
  const billingTargetSuggestions = useMemo(
    () =>
      toSuggestions([
        ...(suggestionEntries ?? []).map((row) => row.billing_target),
        ...visibleRows.map((row) => row.billing_target),
      ]),
    [suggestionEntries, visibleRows],
  );

  // 未保存の編集がある状態で月を変えようとしたら確認し、破棄して切り替える。
  // キャンセルなら月を変えない
  const handleChangeMonth = async (selected: string | null) => {
    if (!selected || selected === month) return;
    if (upsertMutation.isPending) return;
    if (isDirty) {
      const confirmed = await confirmAction(
        "未保存の変更があります。破棄して対象月を切り替えますか？",
      );
      if (!confirmed) return;
      setIsDirty(false);
    }
    // 別の月に移ったら再取得待ちを解く（画面の行は移った先の月の一覧に置き換わるため。
    // 戻ったときに古い一覧しか無ければ isOutdated で編集を止める）
    setSavedSnapshot(null);
    setMonth(selected);
  };

  const handleUpdateRow = (
    id: number,
    updates: Partial<ExtraEntryInListType>,
  ) => {
    setIsDirty(true);
    setRows((prev) =>
      prev.map((row) => (row.id === id ? { ...row, ...updates } : row)),
    );
  };

  const handleAddRow = (entryType: "income" | "expense") => {
    if (!canAddRow) return;
    const newId =
      rows.length > 0 ? Math.max(...rows.map((row) => row.id)) + 1 : 1;
    const newRow: ExtraEntryInListType = {
      id: newId,
      entry_type: entryType,
      category: "",
      entry_date: toFirstOfMonth(month),
      invoice_number: null,
      description: "",
      billing_target: null,
      manager_id: 0,
      team: null,
      billing_amount: null,
      expense_amount: null,
      payment_method: null,
      inserted_at: "",
      updated_at: "",
      isNew: true,
      isRemoved: false,
    };
    setIsDirty(true);
    setRows((prev) => [newRow, ...prev]);
  };

  const handleRemoveRow = (id: number) => {
    setIsDirty(true);
    setRows((prev) =>
      prev.map((row) => (row.id === id ? { ...row, isRemoved: true } : row)),
    );
  };

  const handleSave = async () => {
    // 送るのは追加・削除・編集した行だけ。必須・金額のチェックも送る行（削除以外）に限る
    // （編集していない行・確定済みの月でロックされた行の既存の値で保存が止まらないように）
    const changedRows = selectChangedExtraEntries(rows, baseline);
    if (changedRows.length === 0) {
      setIsDirty(false);
      notifySuccess("変更された項目はありません。");
      return;
    }
    const activeRows = changedRows.filter((row) => !row.isRemoved);
    for (const row of activeRows) {
      const label = row.description || "（内容未入力の行）";
      if (!row.description) {
        notifyError("内容は必須です。未入力の欄があります。");
        return;
      }
      if (!row.category) {
        notifyError(`「${label}」の分類を選択してください。`);
        return;
      }
      if (!row.manager_id) {
        notifyError(`「${label}」の責任者を選択してください。`);
        return;
      }
      if (row.entry_type === "income") {
        if (row.billing_amount === null || row.billing_amount === 0) {
          notifyError(
            `「${label}」の請求額を入力してください（0 は登録できません）。`,
          );
          return;
        }
        if (row.expense_amount === 0) {
          notifyError(
            `「${label}」の経費が 0 円です。経費が無い場合は空欄にしてください。`,
          );
          return;
        }
      } else {
        if (row.expense_amount === null || row.expense_amount === 0) {
          notifyError(
            `「${label}」の経費を入力してください（0 は登録できません）。`,
          );
          return;
        }
        if (!row.payment_method) {
          notifyError(`「${label}」の決済方法を選択してください。`);
          return;
        }
      }
    }

    const lockViolations = findExtraEntryLockViolations(
      changedRows,
      originals,
      closedMonths,
    );
    if (lockViolations.length > 0) {
      notifyError(
        `${CLOSED_MONTH_LOCK_MESSAGE}（対象: ${lockViolations.join("、")}）`,
      );
      return;
    }

    const confirmed = await confirmAction("経理追加収支の項目を更新しますか？");
    if (!confirmed) return;

    try {
      await upsertMutation.mutateAsync(changedRows);
      // 保存に成功した時点の一覧の取得時刻を控え、これより新しい一覧が届くまで同期しない
      // （保存の完了時に進行中だった再取得は onSuccess の無効化で取り消されるため、
      // これ以降に届く一覧は保存後のもの）
      // （保存中にバックグラウンド再取得が完了していた場合も、その一覧を「保存前」として扱う）
      setSavedSnapshot({ month, dataUpdatedAt: getDataUpdatedAt() });
      setIsDirty(false); // 保存成功後は再取得結果との同期を再開する
      notifySuccess("経理追加収支情報を更新しました。");
    } catch (error) {
      console.error("経理追加収支情報の保存に失敗しました。", error);
      if (error instanceof ExtraEntryValidationError) {
        // サーバが拒否・失敗を返した（何も書き込まれていない）
        notifyError(error.message);
        return;
      }
      // 通信の失敗などで保存できたかどうか分からない（保存は 1 トランザクションのため、
      // 保存されていればすべて、されていなければ何も反映されていない）
      notifyError(
        "経理追加収支情報の更新結果を確認できませんでした。画面を再読み込みして内容を確認してください。",
      );
    }
  };

  // ===== 共通セル =====

  const renderCategorySelect = (
    row: ExtraEntryInListType,
    categoryList: string[],
  ) => (
    <Select
      value={row.category || null}
      placeholder="分類を選択"
      data={categoryList}
      disabled={isRowLocked(row) || formLocked}
      onChange={(selected) =>
        handleUpdateRow(row.id, { category: selected ?? "" })
      }
      allowDeselect={false}
    />
  );

  const renderDatePicker = (row: ExtraEntryInListType) =>
    isRowLocked(row) ? (
      <Tooltip label={CLOSED_MONTH_LOCK_MESSAGE} multiline w={260}>
        <div className="flex items-center gap-2">
          <CustomDatePicker
            placeholder="未定は空欄"
            value={row.entry_date}
            onChange={() => {}}
            disabled
          />
          <Badge size="xs" color="teal" variant="light">
            確定済み
          </Badge>
        </div>
      </Tooltip>
    ) : (
      <div className="flex items-center gap-2">
        <CustomDatePicker
          placeholder="未定は空欄"
          value={row.entry_date}
          onChange={(date) => handleUpdateRow(row.id, { entry_date: date })}
          excludeDate={(date) => isClosedMonth(closedMonths, date)}
          disabled={formLocked}
        />
        {row.entry_date === null && (
          <Badge size="xs" color="gray" variant="light">
            月未確定
          </Badge>
        )}
      </div>
    );

  const renderDescriptionInput = (row: ExtraEntryInListType) => (
    <Autocomplete
      value={row.description}
      placeholder="内容を入力"
      data={descriptionSuggestions}
      disabled={isRowLocked(row) || formLocked}
      onChange={(value) => handleUpdateRow(row.id, { description: value })}
    />
  );

  const renderManagerSelect = (row: ExtraEntryInListType) => (
    <Select
      value={row.manager_id ? String(row.manager_id) : null}
      placeholder="責任者を選択"
      data={memberList}
      searchable
      disabled={isRowLocked(row) || formLocked}
      onChange={(selected) =>
        handleUpdateRow(row.id, {
          manager_id: selected ? parseInt(selected, 10) : 0,
        })
      }
      allowDeselect={false}
    />
  );

  const renderTeamSelect = (row: ExtraEntryInListType) => (
    <Select
      value={teamLabel(row.team)}
      data={[ORG_WIDE_TEAM_LABEL, ...teamList]}
      disabled={isRowLocked(row) || formLocked}
      onChange={(selected) =>
        handleUpdateRow(row.id, {
          team: teamFromLabel(selected),
        })
      }
      allowDeselect={false}
    />
  );

  const renderExpenseAmountInput = (
    row: ExtraEntryInListType,
    placeholder?: string,
  ) => (
    <NumberInput
      value={row.expense_amount ?? ""}
      step={1000}
      thousandSeparator=","
      prefix="¥"
      placeholder={placeholder}
      disabled={isRowLocked(row) || formLocked}
      // マイナス金額（減額調整）を許容するため min は設定しない
      onChange={(value) =>
        handleUpdateRow(row.id, {
          expense_amount: typeof value === "number" ? value : null,
        })
      }
    />
  );

  const renderRemoveButton = (row: ExtraEntryInListType) => (
    <button
      type="button"
      aria-label="削除"
      className="text-red-500 hover:text-red-700 disabled:text-gray-300 disabled:cursor-not-allowed"
      disabled={isRowLocked(row) || formLocked}
      title={isRowLocked(row) ? CLOSED_MONTH_LOCK_MESSAGE : undefined}
      onClick={() => handleRemoveRow(row.id)}
    >
      <RiDeleteBin6Line size="1.2rem" />
    </button>
  );

  const monthPicker = (
    <div className="mb-4 max-w-xs">
      <CustomMonthPicker
        label="対象月"
        placeholder="対象月を選択"
        value={month}
        onChange={handleChangeMonth}
        getMonthIndicator={(m) => (closedMonths.has(m) ? "closed" : null)}
      />
    </div>
  );

  // 一覧がまだ無い（初回・月切替の取得失敗／読み込み中）は、月ピッカーと
  // Alert／読み込み中表示だけを返す
  if (!extraEntryList) {
    return (
      <div className="px-4 pb-8 relative">
        {monthPicker}
        {isError ? (
          <Alert color="red" title="経理追加収支情報の取得に失敗しました">
            時間をおいてページを再読み込みしてください。
          </Alert>
        ) : (
          <p className="py-6 text-center text-gray-500">読み込み中…</p>
        )}
      </div>
    );
  }

  return (
    <div className="px-4 pb-8 relative">
      <LoadingOverlay visible={upsertMutation.isPending || isSwitchingMonth} />
      {monthPicker}
      {isOutdated ? (
        <Alert
          color="yellow"
          title={
            isAwaitingRefresh
              ? "保存は完了しましたが、最新の経理追加収支情報を取得できませんでした"
              : "最新の経理追加収支情報を取得できませんでした"
          }
          className="mb-4"
        >
          <p>
            {isAwaitingRefresh
              ? "表示中の内容は保存した時点のものです。"
              : "表示中の内容は、保存・確定などの前に取得した古いものです。"}
            二重登録や上書きを防ぐため、最新の内容を取得できるまで編集・保存はできません。
          </p>
          <Button
            type="button"
            size="xs"
            variant="light"
            className="mt-2"
            onClick={() => refetch()}
          >
            再読み込み
          </Button>
        </Alert>
      ) : (
        isError &&
        !isFetching && (
          <Alert
            color="red"
            title="最新の経理追加収支情報の取得に失敗しました"
            className="mb-4"
          >
            表示中の内容は取得済みのものです。時間をおいてページを再読み込みしてください。
          </Alert>
        )
      )}
      <div className="flex justify-between items-center mb-4 gap-4">
        <p className="text-sm text-gray-600">
          案件に紐づかない収入・支出を登録します。日付の属する月の損益計算書に算入されます（日付未入力は月未確定）。
          一覧には対象月のエントリと月未確定のエントリのみ表示され、日付を別の月に変更して保存した行はその月の一覧に移ります。
          金額は税別で、マイナス値による減額調整も登録できます。損益計算書で確定済みの月のエントリは編集・削除できません（確定済みの月の日付も選べません）。
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

      {/* ===== 収入 ===== */}
      <Title order={3} className="mb-2">
        収入
      </Title>
      <div className="overflow-x-auto border border-gray-300 rounded bg-slate-50 p-4 mb-8">
        <Table verticalSpacing="sm" className="whitespace-nowrap">
          <Table.Thead>
            <Table.Tr>
              <Table.Th className="min-w-36">分類</Table.Th>
              <Table.Th className="min-w-40">日付</Table.Th>
              <Table.Th className="min-w-44">内容</Table.Th>
              <Table.Th className="min-w-32">請求書番号</Table.Th>
              <Table.Th className="min-w-40">請求先</Table.Th>
              <Table.Th className="min-w-32">責任者</Table.Th>
              <Table.Th className="min-w-32">チーム</Table.Th>
              <Table.Th className="min-w-36">請求額（税別）</Table.Th>
              <Table.Th className="min-w-36">経費（税別）</Table.Th>
              <Table.Th className="w-12" />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {incomeRows.map((row) => (
              <Table.Tr key={row.id}>
                <Table.Td>
                  {renderCategorySelect(row, incomeCategoryList)}
                </Table.Td>
                <Table.Td>{renderDatePicker(row)}</Table.Td>
                <Table.Td>{renderDescriptionInput(row)}</Table.Td>
                <Table.Td>
                  <TextInput
                    value={row.invoice_number ?? ""}
                    placeholder="請求書番号"
                    disabled={isRowLocked(row) || formLocked}
                    onChange={(event) =>
                      handleUpdateRow(row.id, {
                        invoice_number: event.target.value || null,
                      })
                    }
                  />
                </Table.Td>
                <Table.Td>
                  <Autocomplete
                    value={row.billing_target ?? ""}
                    placeholder="請求先"
                    data={billingTargetSuggestions}
                    disabled={isRowLocked(row) || formLocked}
                    onChange={(value) =>
                      handleUpdateRow(row.id, {
                        billing_target: value || null,
                      })
                    }
                  />
                </Table.Td>
                <Table.Td>{renderManagerSelect(row)}</Table.Td>
                <Table.Td>{renderTeamSelect(row)}</Table.Td>
                <Table.Td>
                  <NumberInput
                    value={row.billing_amount ?? ""}
                    step={1000}
                    thousandSeparator=","
                    prefix="¥"
                    disabled={isRowLocked(row) || formLocked}
                    // マイナス金額（減額調整）を許容するため min は設定しない
                    onChange={(value) =>
                      handleUpdateRow(row.id, {
                        billing_amount:
                          typeof value === "number" ? value : null,
                      })
                    }
                  />
                </Table.Td>
                <Table.Td>{renderExpenseAmountInput(row, "任意")}</Table.Td>
                <Table.Td>{renderRemoveButton(row)}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
        {incomeRows.length === 0 && (
          <p className="text-center text-gray-500 py-6">
            収入が登録されていません。
          </p>
        )}
        <Button
          type="button"
          fullWidth
          className="mt-4"
          color="dark"
          variant="outline"
          rightSection={<CiSquarePlus />}
          disabled={!canAddRow}
          onClick={() => handleAddRow("income")}
        >
          収入を追加
        </Button>
        {isMonthClosed && (
          <p className="mt-2 text-center text-sm text-gray-600">
            {CLOSED_MONTH_LOCK_MESSAGE}のため追加できません。
          </p>
        )}
      </div>

      {/* ===== 支出 ===== */}
      <Title order={3} className="mb-2">
        支出
      </Title>
      <div className="overflow-x-auto border border-gray-300 rounded bg-slate-50 p-4">
        <Table verticalSpacing="sm" className="whitespace-nowrap">
          <Table.Thead>
            <Table.Tr>
              <Table.Th className="min-w-36">分類</Table.Th>
              <Table.Th className="min-w-40">日付</Table.Th>
              <Table.Th className="min-w-44">内容</Table.Th>
              <Table.Th className="min-w-32">責任者</Table.Th>
              <Table.Th className="min-w-32">チーム</Table.Th>
              <Table.Th className="min-w-36">経費（税別）</Table.Th>
              <Table.Th className="min-w-36">決済方法</Table.Th>
              <Table.Th className="w-12" />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {expenseRows.map((row) => (
              <Table.Tr key={row.id}>
                <Table.Td>
                  {renderCategorySelect(row, expenseCategoryList)}
                </Table.Td>
                <Table.Td>{renderDatePicker(row)}</Table.Td>
                <Table.Td>{renderDescriptionInput(row)}</Table.Td>
                <Table.Td>{renderManagerSelect(row)}</Table.Td>
                <Table.Td>{renderTeamSelect(row)}</Table.Td>
                <Table.Td>{renderExpenseAmountInput(row)}</Table.Td>
                <Table.Td>
                  <Select
                    value={row.payment_method}
                    placeholder="決済方法を選択"
                    data={paymentMethodList}
                    disabled={isRowLocked(row) || formLocked}
                    onChange={(selected) =>
                      handleUpdateRow(row.id, { payment_method: selected })
                    }
                    allowDeselect={false}
                  />
                </Table.Td>
                <Table.Td>{renderRemoveButton(row)}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
        {expenseRows.length === 0 && (
          <p className="text-center text-gray-500 py-6">
            支出が登録されていません。
          </p>
        )}
        <Button
          type="button"
          fullWidth
          className="mt-4"
          color="dark"
          variant="outline"
          rightSection={<CiSquarePlus />}
          disabled={!canAddRow}
          onClick={() => handleAddRow("expense")}
        >
          支出を追加
        </Button>
        {isMonthClosed && (
          <p className="mt-2 text-center text-sm text-gray-600">
            {CLOSED_MONTH_LOCK_MESSAGE}のため追加できません。
          </p>
        )}
      </div>
    </div>
  );
};

export default ExtraEntryList;
