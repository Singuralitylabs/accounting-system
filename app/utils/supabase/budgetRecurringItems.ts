"use server";

import {
  ActiveBudgetRecurringItemsResult,
  BudgetRecurringItemInListType,
  BudgetRecurringItemListResult,
  BudgetRecurringItemSaveResult,
} from "../../types/types";
import {
  BUDGET_DECLARATION_ALLOWED_CLASSES,
  canWriteBudgetTeam,
} from "../budgetDeclaration";
import {
  getBudgetRecurringItemValidationMessage,
  validateBudgetRecurringItemList,
} from "../budgetRecurringItemValidation";
import { toFirstOfMonth, toFirstOfMonthOrNull } from "../formatter";
import { createServerSupabase } from "./clients";
import { assertManagerIdsExist } from "./profiles";
import { getAuthorizedViewer } from "./viewerAccess";

const SUBJECT = "事前収支申告の定期明細";

// 定期明細の管理セクション用の一覧取得。可視範囲は RLS が担保する
// （経理・管理者は全チーム、チームリーダーは自チームのみ。budget_declarations と同じ判定）
export const getBudgetRecurringItemList =
  async (): Promise<BudgetRecurringItemListResult> => {
    const { error: accessError } = await getAuthorizedViewer(
      BUDGET_DECLARATION_ALLOWED_CLASSES,
      SUBJECT,
    );
    if (accessError) {
      return { error: accessError };
    }

    const supabase = createServerSupabase();

    const { data, error } = await supabase
      .from("budget_recurring_items")
      .select("*")
      .order("team", { ascending: true })
      .order("display_order", { ascending: true })
      .order("id", { ascending: true });

    if (error) {
      console.error(`${SUBJECT}の取得に失敗しました:`, error);
      return {
        error: { kind: "fetchFailed", message: `${SUBJECT}の取得に失敗しました。` },
      };
    }

    return { items: data ?? [] };
  };

// 新規申告フォームを開いたときに初期投入する、対象月（"YYYY-MM"）が適用期間内の
// 定期明細（同チーム）を取得する。継続中（end_month が NULL）または
// 対象月が end_month 以前のものが対象。0 件は正常な結果として返す
// （前月コピー用の getPreviousBudgetDeclarationItems と異なり、
// 「該当する定期明細が無い」ことと「取得失敗」だけを区別すればよい）
export const getActiveBudgetRecurringItems = async (
  targetMonth: string,
  team: string,
): Promise<ActiveBudgetRecurringItemsResult> => {
  const { error: accessError } = await getAuthorizedViewer(
    BUDGET_DECLARATION_ALLOWED_CLASSES,
    SUBJECT,
  );
  if (accessError) {
    return { error: accessError };
  }

  const supabase = createServerSupabase();
  const target = toFirstOfMonth(targetMonth);

  const { data, error } = await supabase
    .from("budget_recurring_items")
    .select("id, entry_type, category, description, amount, manager_id, display_order")
    .eq("team", team)
    .lte("start_month", target)
    .or(`end_month.is.null,end_month.gte.${target}`)
    .order("display_order", { ascending: true })
    .order("id", { ascending: true });

  if (error) {
    console.error(`${SUBJECT}の取得に失敗しました:`, error);
    return {
      error: { kind: "fetchFailed", message: `${SUBJECT}の取得に失敗しました。` },
    };
  }

  return { items: data ?? [] };
};

// 一覧の行データを DB 書き込み用の形に変換する（INSERT / UPDATE 共通）
const toDbRow = (row: BudgetRecurringItemInListType) => ({
  team: row.team,
  entry_type: row.entry_type.trim(),
  category: row.category.trim(),
  description: row.description.trim(),
  amount: row.amount,
  manager_id: row.manager_id,
  start_month: toFirstOfMonthOrNull(row.start_month)!,
  end_month: toFirstOfMonthOrNull(row.end_month),
  display_order: row.display_order,
});

// 定期明細管理セクションの一括保存（RecurringCostList の bulkUpsertRecurringCost と
// 同方式のステージング編集。新規 INSERT・既存 UPDATE・削除予定 DELETE を並列実行する）
export const bulkSaveBudgetRecurringItems = async (
  rows: BudgetRecurringItemInListType[],
): Promise<BudgetRecurringItemSaveResult> => {
  const { profileInfo, error: accessError } = await getAuthorizedViewer(
    BUDGET_DECLARATION_ALLOWED_CLASSES,
    SUBJECT,
  );
  if (accessError) {
    return { error: accessError };
  }

  const validation = validateBudgetRecurringItemList(rows);
  if (validation !== "ok") {
    return {
      error: {
        kind: "validationFailed",
        message: getBudgetRecurringItemValidationMessage(validation),
      },
    };
  }

  // RLS が最終防御だが、事前にわかりやすいエラーメッセージを返す。
  // 削除予定行のチームも見る（他チームの行を誤って削除しようとした場合を弾くため）
  const teams = Array.from(new Set(rows.map((row) => row.team)));
  const forbiddenTeam = teams.find(
    (team) => !canWriteBudgetTeam(profileInfo.class, profileInfo.team, team),
  );
  if (forbiddenTeam) {
    return {
      error: {
        kind: "forbidden",
        message: `${forbiddenTeam}の${SUBJECT}を編集する権限がありません。`,
      },
    };
  }

  // display_order はステージング編集中の並び（rows の配列順）から採番し直す。
  // handleAddRow はクライアント側で常に display_order: 0 のまま新規行を追加する
  // ため、渡された値をそのまま使うと新規行が「先頭」扱いになり、team で絞って
  // display_order 順に取得する getActiveBudgetRecurringItems / 一覧取得で並びが
  // 崩れる（saveBudgetDeclaration が明細差し替え時に index で採番し直すのと同じ理由）
  const activeRows = rows
    .filter((row) => !row.isRemoved)
    .map((row, index) => ({ ...row, display_order: index }));
  const newRows = activeRows.filter((row) => row.isNew);
  const updateRows = activeRows.filter((row) => !row.isNew);
  const deleteRows = rows.filter((row) => row.isRemoved && !row.isNew);

  // INSERT/UPDATE/DELETE は非トランザクションで並列実行するため、存在しない
  // manager_id のまま進めると一部だけ失敗し、他の変更のみ反映された状態になりうる
  const managerIds = Array.from(
    new Set(
      [...newRows, ...updateRows]
        .map((row) => row.manager_id)
        .filter((id): id is number => id !== null),
    ),
  );
  const managerIdError = await assertManagerIdsExist(
    managerIds,
    SUBJECT,
    "画面を再読み込みして選び直してください。",
  );
  if (managerIdError) {
    return { error: managerIdError };
  }

  const supabase = createServerSupabase();
  const operations = [];

  if (newRows.length > 0) {
    operations.push(
      supabase.from("budget_recurring_items").insert(newRows.map(toDbRow)),
    );
  }

  if (updateRows.length > 0) {
    operations.push(
      ...updateRows.map((row) =>
        supabase
          .from("budget_recurring_items")
          .update(toDbRow(row))
          .eq("id", row.id),
      ),
    );
  }

  if (deleteRows.length > 0) {
    operations.push(
      supabase
        .from("budget_recurring_items")
        .delete()
        .in(
          "id",
          deleteRows.map((row) => row.id),
        ),
    );
  }

  if (operations.length === 0) {
    return {};
  }

  const results = await Promise.all(operations);
  const errors = results.filter((result) => result.error);

  if (errors.length > 0) {
    console.error(`${SUBJECT}の一括更新でエラーが発生しました:`, errors);
    return {
      error: {
        kind: "partialWriteFailed",
        message: `${SUBJECT}の更新に失敗しました。`,
      },
    };
  }

  return {};
};
