import { ProfilesType } from "../types/types";
import {
  isProfileClass,
  CLASS_DISPLAY_RANK,
  PROFILE_CLASSES,
} from "./permissions";

// Display order for the admin user list. Fetch stays in id order; ordering is decided here.

type SortableUser = Pick<
  ProfilesType,
  "id" | "name" | "class" | "is_teamleader" | "team"
>;

// Values that are not roles / unset go last.
const classRank = (userClass: string | null) =>
  isProfileClass(userClass)
    ? CLASS_DISPLAY_RANK[userClass]
    : PROFILE_CLASSES.length;

// teamList is ordered by display_order. Teams not in it (disabled/renamed) come after, unset last.
const teamRank = (team: string | null, teamList: readonly string[]) => {
  if (!team) return teamList.length + 1;
  const index = teamList.indexOf(team);
  return index === -1 ? teamList.length : index;
};

// Returns a new array (class -> teamleaders first -> team -> name). Unlisted teams sort by name to group them; ties fall
// back to id so the display is stable.
export const sortUserList = <T extends SortableUser>(
  users: readonly T[],
  teamList: readonly string[],
): T[] =>
  [...users].sort(
    (a, b) =>
      classRank(a.class) - classRank(b.class) ||
      Number(b.is_teamleader) - Number(a.is_teamleader) ||
      teamRank(a.team, teamList) - teamRank(b.team, teamList) ||
      (a.team ?? "").localeCompare(b.team ?? "", "ja") ||
      a.name.localeCompare(b.name, "ja") ||
      a.id - b.id,
  );
