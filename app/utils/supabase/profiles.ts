"use server";

import { User } from "@supabase/supabase-js";
import { AccessFailure } from "../../types/types";
import { isAllowedEmailDomain } from "../constants";
import {
  formatUserValidationErrors,
  ProfileUpdateInput,
  toProfileDbRow,
  validateUserUpdates,
} from "../userList";
import { getCachedProfileInfo, getCachedProfileInfoById } from "./requestCache";
import { createServerSupabase } from "./clients";

export const getProfileInfo = async () => {
  try {
    return await getCachedProfileInfo();
  } catch (error) {
    console.error("Unexpected error in getProfileInfo:", error);
    return { error: new Error("予期せぬエラーが発生しました。") };
  }
};

export const getProfileInfoById = async (userId: string) => {
  try {
    return await getCachedProfileInfoById(userId);
  } catch (error) {
    console.error("Unexpected error in getProfileInfoById:", error);
    return { error: new Error("予期せぬエラーが発生しました。") };
  }
};

// 取得失敗（DB 障害・権限エラー）と「0 件」を呼び出し元が区別できるよう、
// error を握りつぶさず結果に含めて返す。
export const getAllUserInfo = async () => {
  const supabase = createServerSupabase();

  const { data: userInfoList, error } = await supabase
    .from("profiles")
    .select("*")
    .order("id", { ascending: true });

  if (error) {
    console.error("ユーザー情報の取得に失敗しました:", error);
  }

  return { userInfoList, error };
};

// 担当者選択の選択肢（全メンバーの id/name）を返す。profiles への直接 SELECT
// （getAllUserInfo）は RLS で teamleader が自チームに絞られるため使えない
// （事前収支申告は teamleader もアクセスでき、選択肢は全メンバーである必要がある）。
// DB 関数 get_member_options（SECURITY DEFINER。migration 21）経由で取得する
// エラー時のログは呼び出し元（利用箇所の文脈が分かる場所）に任せる。
// ここで console.error すると、呼び出し元も別途ログする場合に同じエラーが
// 2 回出力されてノイズになる（DynamicBudgetDeclarations.tsx 参照）
export const getMemberOptions = async () => {
  const supabase = createServerSupabase();

  const { data: memberOptions, error } = await supabase.rpc(
    "get_member_options",
  );

  return { memberOptions, error };
};

// 渡された id のうち実在する profiles.id のみを返す（事前収支申告の manager_id
// 保存前検証用）。get_member_options() で全メンバーを取得して JS 側で照合する
// こともできるが、保存のたびに全メンバー分の行を転送するのは無駄
// （メンバー数が増えるほど悪化する）ため、id 集合だけを DB 側で照合する
export const validateMemberIds = async (targetIds: number[]) => {
  const supabase = createServerSupabase();

  const { data: existingIds, error } = await supabase.rpc(
    "validate_member_ids",
    { target_ids: targetIds },
  );

  return { existingIds, error };
};

// 保存前に manager_id が実在する profiles.id か確認する共通ヘルパ。
// 存在しない manager_id のまま書き込みへ進めると FK 違反（23503）という
// 分かりにくいエラーで失敗するため、DB 書き込みの前にここで弾いてわかりやすい
// エラーメッセージを返す。budgetRecurringItems.ts（明細の書き込みが非トランザクション
// = 複数行の並列 INSERT/UPDATE）では存在しない manager_id により一部だけ反映された
// 状態（partialWriteFailed）を防ぐ役割も兼ねるが、budgetDeclarations.ts の保存は
// save_budget_declaration（migration 24）内の単一トランザクションで原子的に行われる
// ため、このチェックを経ずに FK 違反が起きても保存前の状態に完全にロールバックされる。
// 問題なければ null、問題があれば呼び出し元にそのまま返せる AccessFailure を返す
export const assertManagerIdsExist = async (
  managerIds: number[],
  subject: string,
  // 「見つからない」場合の案内文の末尾（呼び出し元の画面遷移に合わせて変える。
  // 例: "フォームを開き直して選び直してください。" / "画面を再読み込みして選び直してください。"）
  notFoundHint: string,
): Promise<AccessFailure | null> => {
  if (managerIds.length === 0) return null;

  const { existingIds: validIds, error } = await validateMemberIds(managerIds);
  if (error) {
    console.error(`${subject}の担当者確認に失敗しました:`, error);
    return {
      kind: "fetchFailed",
      message: `${subject}の担当者確認に失敗しました。`,
    };
  }

  const existingIds = new Set((validIds ?? []).map((row) => row.id));
  if (managerIds.some((id) => !existingIds.has(id))) {
    return {
      kind: "validationFailed",
      message: `選択された担当者が見つかりません。${notFoundHint}`,
    };
  }

  return null;
};

export const insertUserInfo = async ({
  user,
  name,
  email,
}: {
  user: User;
  name: string;
  email: string;
}) => {
  // 多層防御: 呼び出し元（OAuth コールバック）でもドメイン検証しているが、
  // プロフィール作成の最終段でも許可ドメイン外を弾く。
  if (!isAllowedEmailDomain(email)) {
    console.warn(`許可されていないドメインのプロフィール作成を拒否しました: ${email}`);
    return { error: new Error("許可されていないドメインのメールアドレスです。") };
  }

  const supabase = createServerSupabase();

  try {
    const { error: insertError } = await supabase
      .from("profiles")
      .insert([
        {
          user_id: user.id,
          email: email,
          name: name,
          class: "public",
          inserted_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ])
      .select()
      .single();

    if (insertError) {
      console.error(
        `profilesテーブルへの${name}の追加処理で失敗しました。`,
        insertError
      );
      return { error: insertError };
    }

    return { error: null };
  } catch (error) {
    console.error("Unexpected error during insert:", error);
    return { error };
  }
};

export type BulkUpdateProfilesResult = { error?: AccessFailure };

const PROFILES_SAVE_FAILED: AccessFailure = {
  kind: "fetchFailed",
  message: "ユーザー情報の保存に失敗しました。何も保存されていません。",
};

// 管理画面のユーザーリストの一括保存（権限・チーム・Slack ID）。
// updates は変更した行のみ（画面側で selectChangedUsers により選ぶ）。
// 書き込みは update_profiles（migration 33。1 トランザクション・1 文の UPDATE）で行い、
// 1 件でも保存できなければすべてロールバックされる（一部だけ保存された状態は残らない）。
// 他人の行を更新できるのは admin だけで、RLS（SECURITY INVOKER）で担保される。
// RLS で弾かれた行・存在しない行があると NOT_APPLIED、admin 以外が権限・チームを
// 変えようとすると RLS 違反（42501）、不正な入力は INVALID_INPUT（22023）になる。
// Server Action として公開されるため、画面側と同じ入力チェックをここでも行い、
// 書き込む列は toProfileDbRow で権限・チーム・Slack ID に限定する
export const bulkUpdateProfiles = async (
  updates: ProfileUpdateInput[],
): Promise<BulkUpdateProfilesResult> => {
  if (updates.length === 0) {
    return {};
  }

  const validationErrors = validateUserUpdates(updates);
  if (validationErrors.size > 0) {
    return {
      error: {
        kind: "validationFailed",
        message: `入力内容に誤りがあるため、何も保存しませんでした。（${formatUserValidationErrors(
          updates,
          validationErrors,
        ).join("、")}）`,
      },
    };
  }

  const supabase = createServerSupabase();
  const { error: rpcError } = await supabase.rpc("update_profiles", {
    p_updates: updates.map(toProfileDbRow),
  });
  if (rpcError) {
    // 不正な入力（キーの欠落・id の重複や null・許可値以外の権限など）は
    // update_profiles が INVALID_INPUT（22023）で全体を拒否する。22023 は他の原因でも
    // 返り得るため、例外のメッセージで判定する
    if (rpcError.message.includes("INVALID_INPUT")) {
      return {
        error: {
          kind: "validationFailed",
          message:
            "入力内容が正しくないため、何も保存しませんでした。画面を再読み込みしてから保存し直してください。",
        },
      };
    }
    if (
      rpcError.message.includes("NOT_APPLIED") ||
      rpcError.code === "42501"
    ) {
      return {
        error: {
          kind: "validationFailed",
          message:
            "保存できないユーザーが含まれていたため、何も保存しませんでした。管理者権限が外れたか、ユーザーが削除された可能性があります。画面を再読み込みしてから保存し直してください。",
        },
      };
    }
    console.error("ユーザー情報の保存に失敗しました:", rpcError);
    return { error: PROFILES_SAVE_FAILED };
  }

  return {};
};
