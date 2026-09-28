import { ProfilesType } from "../types/types";

// 管理画面のユーザーリスト（/dashboard/users）の一括保存まわりの純粋関数。
// Supabase アクセス（app/utils/supabase/profiles.ts）・画面（app/components/UserList.tsx）から
// 切り離し、副作用なしでユニットテストできるようにする（docs/testing.md「2.6」）。

// 一括保存でサーバへ送る 1 行分（update_profiles の p_updates の要素。migration 33）
export type ProfileUpdateInput = Pick<
  ProfilesType,
  "id" | "name" | "class" | "team" | "slack_id"
>;

// 一覧の行を DB 書き込み用の形に変換する。書き込むのは権限・チーム・Slack ID だけ
// （name はエラーメッセージ用で書き込まない）。空文字は未設定（null）として扱う。
// updated_at は update_profiles（と既存のトリガー）が now() で設定する
export const toProfileDbRow = (user: ProfileUpdateInput) => ({
  id: user.id,
  class: user.class || null,
  team: user.team || null,
  slack_id: user.slack_id || null,
});

// 読み込み時点の行（baseline）から、権限・チーム・Slack ID のいずれかが変わったか
export const isUserChanged = (
  original: ProfileUpdateInput,
  user: ProfileUpdateInput,
): boolean => {
  const before = toProfileDbRow(original);
  const after = toProfileDbRow(user);
  return (
    before.class !== after.class ||
    before.team !== after.team ||
    before.slack_id !== after.slack_id
  );
};

// 一括保存でサーバへ送る行（変更した行）を選ぶ。baseline は画面に読み込んだ時点
// （または直前の保存成功時点）の行（id → 行）。変更していない行は送らない
// （他の管理者がその後に保存した内容を、読み込み時点の値で上書きしない）
export const selectChangedUsers = <T extends ProfileUpdateInput>(
  rows: T[],
  baseline: ReadonlyMap<number, ProfileUpdateInput>,
): T[] =>
  rows.filter((row) => {
    const base = baseline.get(row.id);
    return !base || isUserChanged(base, row);
  });

export type UserValidationErrors = {
  class?: string;
  team?: string;
};

export const CLASS_REQUIRED_MESSAGE = "権限を選択してください。";
export const TEAM_REQUIRED_MESSAGE = "チームリーダーはチームが必須です。";

// 保存前の入力チェック（id → 項目ごとのエラー）。エラーの無い行は含めない。
// - 権限は必須
// - teamleader はチームが必須（docs/specification.md §5.3.9）
export const validateUserUpdates = (
  rows: ProfileUpdateInput[],
): Map<number, UserValidationErrors> => {
  const result = new Map<number, UserValidationErrors>();
  for (const row of rows) {
    const errors: UserValidationErrors = {};
    if (!row.class) {
      errors.class = CLASS_REQUIRED_MESSAGE;
    } else if (row.class === "teamleader" && !row.team) {
      errors.team = TEAM_REQUIRED_MESSAGE;
    }
    if (errors.class || errors.team) {
      result.set(row.id, errors);
    }
  }
  return result;
};

// 入力エラーを「名前: 内容」の一覧にする（画面上部のまとめ表示・サーバ側の拒否メッセージ用）
export const formatUserValidationErrors = (
  rows: ProfileUpdateInput[],
  errors: ReadonlyMap<number, UserValidationErrors>,
): string[] =>
  rows.flatMap((row) => {
    const rowErrors = errors.get(row.id);
    if (!rowErrors) return [];
    return [rowErrors.class, rowErrors.team]
      .filter((message): message is string => !!message)
      .map((message) => `${row.name}: ${message}`);
  });
