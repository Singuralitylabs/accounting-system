"use client";

import { Button, LoadingOverlay, Table, Title } from "@mantine/core";
import { SelectOptionType } from "../types/types";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  bulkUpsertSelectOptions,
  InsertedSelectOptionId,
} from "../utils/supabase/selectOptions";
import { notifyError, notifySuccess } from "../utils/notify";
import { confirmAction } from "../utils/confirmAction";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { SortableTableRow } from "./SortableTableRow";
import { CiSquarePlus } from "react-icons/ci";
import { useReportDashboardUnsavedChanges } from "./dashboard/DashboardUnsavedChanges";

type OptionRow = Pick<
  SelectOptionType,
  "id" | "value" | "display_order" | "is_active"
> & { isNew: boolean };

const toOptionRows = (
  optionList: Pick<
    SelectOptionType,
    "id" | "value" | "display_order" | "is_active"
  >[],
): OptionRow[] => optionList.map((option) => ({ ...option, isNew: false }));

// 変更の有無の比較用（並び順・項目名・表示順・有効 / 無効・追加した行）。
// 追加してすぐ削除した行は保存されないため比較から除く
const optionRowsKey = (rows: OptionRow[]) =>
  JSON.stringify(
    rows
      .filter((row) => !(row.isNew && !row.is_active))
      .map((row) => [
        row.id,
        row.isNew,
        row.value,
        row.display_order,
        row.is_active,
      ]),
  );

// 保存済みの状態（baseline）から編集されているか
export const hasOptionListChanges = (
  baseline: OptionRow[],
  rows: OptionRow[],
) => optionRowsKey(baseline) !== optionRowsKey(rows);

// 保存で追加された行を、仮 id から DB の id に置き換えて保存済み（isNew: false）にする。
// これを baseline・表示にすることで、再取得（router.refresh）が届く前に続けて保存しても
// 同じ行を再び追加せず、保存済みの行の削除も無効化（UPDATE）として送られる。
// 削除済みの行を再び有効にした場合（同じ名前の行を削除してから追加した場合）は、
// 追加した行がその行の id になるため、画面に残っている削除済みの同じ id の行は除く
export const applyInsertedOptionIds = (
  rows: OptionRow[],
  insertedIds: InsertedSelectOptionId[],
): OptionRow[] => {
  const idByTempId = new Map(insertedIds.map(({ tempId, id }) => [tempId, id]));
  const insertedDbIds = new Set(insertedIds.map(({ id }) => id));
  return rows
    .filter((row) => row.isNew || !insertedDbIds.has(row.id))
    .map((row) => {
      const id = row.isNew ? idByTempId.get(row.id) : undefined;
      return id === undefined ? row : { ...row, id, isNew: false };
    });
};

// 追加してすぐ削除した行（保存していない行）を除く
const withoutDiscardedNewRows = (rows: OptionRow[]) =>
  rows.filter((row) => !(row.isNew && !row.is_active));

// 保存が途中で失敗したとき、保存できた行に変更した内容が含まれていたか
// （追加できた行がある、または UPDATE できた既存の行が baseline から変わっていた）
export const hasPartiallySavedChanges = (
  baseline: OptionRow[],
  sentRows: OptionRow[],
  insertedIds: InsertedSelectOptionId[],
  updatedIds: number[],
) => {
  if (insertedIds.length > 0) return true;
  const baselineKeyById = new Map(
    baseline.map((row) => [row.id, optionRowsKey([row])]),
  );
  const updated = new Set(updatedIds);
  return sentRows.some(
    (row) =>
      !row.isNew &&
      updated.has(row.id) &&
      baselineKeyById.get(row.id) !== optionRowsKey([row]),
  );
};

// 保存が途中で失敗したときの、新しい保存済みの状態（baseline）。保存できた行（UPDATE
// できた既存の行と追加できた行）は送った内容（追加した行は DB の id に置き換える）、
// 保存できなかった既存の行は元の baseline の内容にする。保存できなかった追加行は DB に
// 無いため含めない。行の並びは送った内容（sentRows）に合わせる。
// これにより、保存できた変更を画面で元に戻した場合も「未保存の変更あり」になり、
// 保存し直して DB を画面に合わせられる
export const baselineAfterPartialSave = (
  baseline: OptionRow[],
  sentRows: OptionRow[],
  insertedIds: InsertedSelectOptionId[],
  updatedIds: number[],
): OptionRow[] => {
  const baselineById = new Map(baseline.map((row) => [row.id, row]));
  const insertedTempIds = new Set(insertedIds.map(({ tempId }) => tempId));
  const updated = new Set(updatedIds);
  const merged = sentRows.flatMap((row) => {
    if (row.isNew) return insertedTempIds.has(row.id) ? [row] : [];
    if (updated.has(row.id)) return [row];
    const saved = baselineById.get(row.id);
    return saved ? [saved] : [];
  });
  return applyInsertedOptionIds(merged, insertedIds);
};

// 表示中の（有効な）行どうしで重なっている項目名（最初に見つかったもの）。
// 項目名は種類ごとに一意（UNIQUE(type_id, value)）のため、保存前に止める
export const findDuplicateOptionValue = (rows: OptionRow[]) => {
  const seen = new Set<string>();
  for (const row of rows) {
    if (!row.is_active) continue;
    if (seen.has(row.value)) return row.value;
    seen.add(row.value);
  }
  return undefined;
};

const SelectOptionList = ({
  optionClass,
  optionList,
}: {
  optionClass: string;
  optionList: Pick<
    SelectOptionType,
    "id" | "value" | "display_order" | "is_active"
  >[];
}) => {
  const [updatedOptionList, setUpdatedOptionList] = useState<OptionRow[]>(() =>
    toOptionRows(optionList),
  );
  // 画面に読み込んだ時点（または直前の保存成功時点）の状態。これと比べて未保存の変更が
  // あるかを管理画面のメニュー（DashboardNav）に知らせ、切り替え前の確認に使う
  const [baseline, setBaseline] = useState<OptionRow[]>(() =>
    toOptionRows(optionList),
  );
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const hasChanges = hasOptionListChanges(baseline, updatedOptionList);
  useReportDashboardUnsavedChanges(hasChanges);

  // 保存後の再取得（router.refresh）などでサーバの選択肢が変わったら、未保存の変更が
  // 無い場合に限り表示を同期する（保存で追加した行に DB の id を反映する。編集中の
  // 内容は黙って破棄しない。編集を終えて変更が無くなった時点で同期する）
  const syncedOptionListRef = useRef(optionList);
  // 最新の props（保存成功時に「同期済み」として扱うため）
  const latestOptionListRef = useRef(optionList);
  latestOptionListRef.current = optionList;
  useEffect(() => {
    if (!hasChanges && optionList !== syncedOptionListRef.current) {
      syncedOptionListRef.current = optionList;
      const rows = toOptionRows(optionList);
      setUpdatedOptionList(rows);
      setBaseline(rows);
    }
  }, [optionList, hasChanges]);

  const OPTION_TITLES: Record<string, string> = {
    team: "チーム",
    category: "分類",
    item: "品目",
    extra_income_category: "収入分類",
    extra_expense_category: "支出分類",
    payment_method: "決済方法",
  };
  const optionTitle = OPTION_TITLES[optionClass] ?? optionClass;

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleUpdateTeamList = (
    id: number,
    updates: { value: string } | { is_active: boolean },
  ) => {
    setUpdatedOptionList(
      updatedOptionList.map((option) =>
        option.id === id ? { ...option, ...updates } : option,
      ),
    );
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setUpdatedOptionList((items) => {
        const oldIndex = items.findIndex((item) => item.id === active.id);
        const newIndex = items.findIndex((item) => item.id === over.id);

        const newItems = arrayMove(items, oldIndex, newIndex);
        return newItems.map((item, index) => ({
          ...item,
          display_order: index + 1,
        }));
      });
    }
  };

  const handleAddOption = () => {
    // 追加した行の仮 id は負の数にする（保存で DB が採番する id（正の数）と重ならない
    // ように。保存に成功した行は DB の id に置き換える）
    const newId =
      Math.min(0, ...updatedOptionList.map((option) => option.id)) - 1;
    const newOption = {
      id: newId,
      value: "",
      display_order: updatedOptionList.length + 1,
      is_active: true,
      isNew: true,
    };
    setUpdatedOptionList([...updatedOptionList, newOption]);
  };

  const handleRemoveOption = async (id: number) => {
    setUpdatedOptionList(
      updatedOptionList.map((option) =>
        option.id === id ? { ...option, is_active: false } : option,
      ),
    );
  };

  const handleSaveOption = async () => {
    try {
      setIsLoading(true);
      for (const option of updatedOptionList) {
        if (!option.value && option.is_active) {
          notifyError("未入力の欄があります。");
          return;
        }
      }
      const duplicateValue = findDuplicateOptionValue(updatedOptionList);
      if (duplicateValue !== undefined) {
        notifyError(
          `「${duplicateValue}」が複数あります。項目名が重ならないようにしてください。`,
        );
        return;
      }

      const confirmed = await confirmAction(
        `${optionTitle}の項目を更新しますか？`,
      );
      if (!confirmed) return;

      // 送った時点の内容（保存の応答を待つ間にも編集できるため、保存結果の baseline は
      // これから作り、表示には最新の編集内容に id の置き換えだけを適用する）
      const sentRows = updatedOptionList;
      const { insertedIds, updatedIds, error } = await bulkUpsertSelectOptions(
        optionClass,
        sentRows,
      );
      // 追加できた行は DB の id に置き換える（途中で失敗した場合も、保存し直したときに
      // 同じ行を再び追加しないように）
      setUpdatedOptionList((prev) => applyInsertedOptionIds(prev, insertedIds));
      if (error) {
        console.error(`${optionTitle}情報の保存に失敗しました。`, error);
        const savedIds = updatedIds ?? [];
        const partiallySaved = hasPartiallySavedChanges(
          baseline,
          sentRows,
          insertedIds,
          savedIds,
        );
        if (insertedIds.length > 0 || savedIds.length > 0) {
          // 保存できた行を baseline に取り込む（保存できた変更を画面で元に戻したときに
          // 「変更なし」になって DB と画面がずれたままにならないように）
          setBaseline((prev) =>
            baselineAfterPartialSave(prev, sentRows, insertedIds, savedIds),
          );
          // 保存に成功した場合と同じく、保留していた保存前の props で表示を戻さない
          syncedOptionListRef.current = latestOptionListRef.current;
        }
        notifyError(
          `${optionTitle}情報の保存に失敗しました。${error}${
            partiallySaved ? "一部の項目は保存済みです。" : ""
          }`,
        );
        return;
      }
      // 送った内容を新しい baseline にする（保存の応答を待つ間に編集していなければ、
      // 未保存の変更なしになる）。追加してすぐ削除した行は保存していないため除く
      setBaseline(
        withoutDiscardedNewRows(applyInsertedOptionIds(sentRows, insertedIds)),
      );
      setUpdatedOptionList((prev) => withoutDiscardedNewRows(prev));
      // 編集中に届いて保留していた props（この保存より前の内容）を同期済みとして扱い、
      // 保存した値が保存前の内容でいったん戻って見えないようにする（次に届く props から反映する）
      syncedOptionListRef.current = latestOptionListRef.current;
      notifySuccess(`${optionTitle}情報を更新しました。`);
      // ユーザー管理画面（/dashboard/users）のチーム欄などはサーバで取得した選択肢を
      // props で受け取っているため、Server Component を再描画し、クライアントの
      // ルーターキャッシュも破棄して、画面を切り替えたときに最新の選択肢を反映する
      router.refresh();
    } catch (error) {
      console.error(`${optionTitle}情報の保存に失敗しました。`, error);
      notifyError(`${optionTitle}情報の保存に失敗しました。`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative p-4 border-collapse border border-gray-500 bg-slate-50 rounded">
      <div className="flex justify-between items-center">
        <Title order={3} className="pb-4">
          {optionTitle}
        </Title>
        <Button
          type="button"
          // 未保存の変更が無い間は押せない（保存後の再取得を待つ間の連打で、追加した行が
          // 再び登録されるのを防ぐ）
          disabled={isLoading || !hasChanges}
          onClick={handleSaveOption}
        >
          更新
        </Button>
      </div>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <Table>
          <Table.Tbody>
            <SortableContext
              items={updatedOptionList}
              strategy={verticalListSortingStrategy}
            >
              {updatedOptionList
                .filter((option) => option.is_active)
                .map((option) => (
                  <SortableTableRow
                    key={option.id}
                    option={option}
                    onUpdate={handleUpdateTeamList}
                    onRemove={handleRemoveOption}
                  />
                ))}
            </SortableContext>
          </Table.Tbody>
        </Table>
        <Button
          type="button"
          fullWidth
          className="mt-4"
          color="dark"
          variant="outline"
          rightSection={<CiSquarePlus />}
          onClick={handleAddOption}
        >
          {optionTitle}追加
        </Button>
      </DndContext>
      <LoadingOverlay visible={isLoading} />
    </div>
  );
};

export default SelectOptionList;
