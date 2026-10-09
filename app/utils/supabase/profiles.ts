"use server";

import { User } from "@supabase/supabase-js";
import { AccessFailure } from "../../types/types";
import { isAllowedEmailDomain } from "../constants";
import { hasClassAccess, PROFILE_WRITE_CLASSES } from "../permissions";
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

// error is returned (not swallowed) so callers can tell a failure from 0 rows.
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

// Returns all members' id/name for the manager picker. A direct profiles SELECT (getAllUserInfo) is
// limited to the own team for teamleader by RLS, but budget declarations need all members, so use
// get_member_options (SECURITY DEFINER, migration 21). Errors are logged by the caller (which has
// the context) to avoid double logging (see DynamicBudgetDeclarations.tsx).
export const getMemberOptions = async () => {
  const supabase = createServerSupabase();

  const { data: memberOptions, error } = await supabase.rpc(
    "get_member_options",
  );

  return { memberOptions, error };
};

// Returns only ids that exist in profiles (pre-save manager_id check). Checking a set in the DB
// avoids transferring all members via get_member_options() on every save.
export const validateMemberIds = async (targetIds: number[]) => {
  const supabase = createServerSupabase();

  const { data: existingIds, error } = await supabase.rpc(
    "validate_member_ids",
    { target_ids: targetIds },
  );

  return { existingIds, error };
};

// Shared pre-save check that manager_id exists in profiles: returns null if OK, otherwise an
// AccessFailure to return as-is. Avoids an obscure FK violation (23503). Both callers save in one
// transaction (save_budget_declaration, save_budget_recurring_items), so an FK violation would roll back fully.
export const assertManagerIdsExist = async (
  managerIds: number[],
  subject: string,
  // Suffix of the "not found" message, varied per caller's screen flow.
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
  // Defense in depth: the OAuth callback also validates the domain; reject non-allowed domains at profile creation too.
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

// Bulk save of role/team/Slack ID. `updates` are changed rows only (selectChangedUsers). Written by
// update_profiles (migration 33; one transaction, one UPDATE): any failure rolls back everything.
// Updating others' rows is admin-only via RLS (SECURITY INVOKER). Because this is a Server Action,
// also require admin here before any validation or write (defense in depth), so no other user's
// names leak through validation messages. NOT_APPLIED: RLS-rejected or missing rows; 42501: a
// non-admin changing role/team; INVALID_INPUT (22023): bad input. The same validation as the UI
// runs here, and written columns are limited by toProfileDbRow.
export const bulkUpdateProfiles = async (
  updates: ProfileUpdateInput[],
): Promise<BulkUpdateProfilesResult> => {
  // Not viewerAccess.getAuthorizedViewer: it imports profiles.ts (circular import). Do the same
  // profile fetch -> hasClassAccess here.
  const { profileInfo, error: profileError } = await getProfileInfo();
  if (profileError || !profileInfo) {
    console.error(
      "ユーザー情報の保存前に、保存する人の権限を確認できませんでした。",
      profileError,
    );
    return {
      error: {
        kind: "fetchFailed",
        message:
          "権限を確認できなかったため、何も保存しませんでした。時間をおいて保存し直してください。",
      },
    };
  }
  if (!hasClassAccess(
      PROFILE_WRITE_CLASSES,
      profileInfo.class,
      profileInfo.is_teamleader,
    )) {
    console.error(
      `ユーザー情報を保存する権限がありません（管理者のみ）。profiles.id: ${profileInfo.id}`,
    );
    return {
      error: {
        kind: "forbidden",
        message:
          "ユーザー情報を保存する権限がありません（管理者のみ）。何も保存されていません。",
      },
    };
  }

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
    // update_profiles rejects invalid input (missing keys, duplicate/null ids, disallowed role) as a
    // whole with INVALID_INPUT (22023). 22023 can come from other causes, so match the exception message.
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
