import {
  isProfileClass,
  CLASS_DISPLAY_RANK,
  ROLE_LABELS,
  PROFILE_CLASSES,
  ProfileClass,
} from "./permissions";

// Grouping and team colors for the admin user list (sorting is in userListSort.ts).

export type UserRoleSectionKey = ProfileClass | "unset";

export type UserRoleSection<T> = {
  key: UserRoleSectionKey;
  label: string;
  users: T[];
};

const UNSET_LABEL = "未設定";

// Classes in display order (admin -> accounting -> public), derived from CLASS_DISPLAY_RANK. The
// teamleader flag does not make a section; teamleaders sort first inside their class (userListSort.ts).
const CLASSES_IN_DISPLAY_ORDER = [...PROFILE_CLASSES].sort(
  (a, b) => CLASS_DISPLAY_RANK[a] - CLASS_DISPLAY_RANK[b],
);

// Splits users into class sections in display order; a missing / invalid role goes to a trailing
// "unset" section and empty sections are omitted. Order inside a section follows the input order.
// `sectionRoleOf` lets the caller keep an edited row in its saved section until the save succeeds.
export const groupUsersByRole = <T extends { class: string | null }>(
  users: readonly T[],
  sectionRoleOf: (user: T) => string | null = (user) => user.class,
): UserRoleSection<T>[] => {
  const usersByKey = new Map<UserRoleSectionKey, T[]>();
  for (const user of users) {
    const role = sectionRoleOf(user);
    const key: UserRoleSectionKey = isProfileClass(role) ? role : "unset";
    usersByKey.set(key, [...(usersByKey.get(key) ?? []), user]);
  }

  return [...CLASSES_IN_DISPLAY_ORDER, "unset" as const].flatMap((key) => {
    const sectionUsers = usersByKey.get(key);
    return sectionUsers
      ? [
          {
            key,
            label: key === "unset" ? UNSET_LABEL : ROLE_LABELS[key],
            users: sectionUsers,
          },
        ]
      : [];
  });
};

// Light colors that keep dark text readable. Assigned by the team's position in the master order,
// so reordering teams in the options screen changes the assignment. Reused from the top when the
// teams outnumber the palette.
export const TEAM_COLOR_PALETTE = [
  "#e7f5ff",
  "#ebfbee",
  "#fff0f6",
  "#f3f0ff",
  "#fff4e6",
  "#e3fafc",
  "#f4fce3",
  "#fff5f5",
] as const;

// undefined for an unset team or one missing from the master (disabled / renamed).
export const teamRowColor = (
  team: string | null,
  teamList: readonly string[],
): string | undefined => {
  if (!team) return undefined;
  const index = teamList.indexOf(team);
  return index === -1
    ? undefined
    : TEAM_COLOR_PALETTE[index % TEAM_COLOR_PALETTE.length];
};

// Left edge marker for a changed row (replaces the yellow background so the team color stays visible).
export const CHANGED_ROW_MARK_COLOR = "#f97316";
