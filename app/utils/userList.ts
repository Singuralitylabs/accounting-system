import { ProfilesType } from "../types/types";
import { isProfileClass } from "./permissions";

// Pure functions for the admin user list bulk save, separate from Supabase access and UI so they
// can be unit-tested.

export type ProfileUpdateInput = Pick<
  ProfilesType,
  "id" | "name" | "class" | "is_teamleader" | "team" | "slack_id"
>;

// Writes only class, teamleader flag, team and Slack ID (name is for error messages). Empty string becomes null.
// updated_at is set by update_profiles / triggers.
export const toProfileDbRow = (user: ProfileUpdateInput) => ({
  id: user.id,
  class: user.class || null,
  is_teamleader: user.is_teamleader === true,
  team: user.team || null,
  slack_id: user.slack_id || null,
});

export const isUserChanged = (
  original: ProfileUpdateInput,
  user: ProfileUpdateInput,
): boolean => {
  const before = toProfileDbRow(original);
  const after = toProfileDbRow(user);
  return (
    before.class !== after.class ||
    before.is_teamleader !== after.is_teamleader ||
    before.team !== after.team ||
    before.slack_id !== after.slack_id
  );
};

// Sends only changed rows so another admin's later save is not overwritten with stale values.
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
export const CLASS_INVALID_MESSAGE = "権限の値が正しくありません。";
export const TEAM_REQUIRED_MESSAGE = "チームリーダーはチームが必須です。";

// Returns id -> per-field errors (rows without errors omitted). Class is required and must be in
// PROFILE_CLASSES; the teamleader flag requires a team.
export const validateUserUpdates = (
  rows: ProfileUpdateInput[],
): Map<number, UserValidationErrors> => {
  const result = new Map<number, UserValidationErrors>();
  for (const row of rows) {
    const errors: UserValidationErrors = {};
    if (!row.class) {
      errors.class = CLASS_REQUIRED_MESSAGE;
    } else if (!isProfileClass(row.class)) {
      errors.class = CLASS_INVALID_MESSAGE;
    }
    if (row.is_teamleader && !row.team) {
      errors.team = TEAM_REQUIRED_MESSAGE;
    }
    if (errors.class || errors.team) {
      result.set(row.id, errors);
    }
  }
  return result;
};

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
