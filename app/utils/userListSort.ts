import { ProfilesType } from "../types/types";

// 管理画面のユーザーリスト（/dashboard/users）の表示順を決める純粋関数。
// 取得（getAllUserInfo）は id 順のままとし、表示順は画面側でこの関数により決める。

// 権限の表示順（上ほど先）。これ以外の値・未設定は末尾
const CLASS_ORDER = ["admin", "accounting", "teamleader", "public"];

type SortableUser = Pick<ProfilesType, "id" | "name" | "class" | "team">;

const classRank = (userClass: string | null) => {
  const index = userClass ? CLASS_ORDER.indexOf(userClass) : -1;
  return index === -1 ? CLASS_ORDER.length : index;
};

// チームの表示順。teamList は項目管理の表示順（display_order）で並んだチームの選択肢。
// 選択肢に無いチーム（無効化・名前変更されたチーム）は選択肢のチームの後ろ、
// チーム未設定はさらに後ろ（末尾）
const teamRank = (team: string | null, teamList: readonly string[]) => {
  if (!team) return teamList.length + 1;
  const index = teamList.indexOf(team);
  return index === -1 ? teamList.length : index;
};

// 権限 → チーム → 名前の順に並べた新しい配列を返す（元の配列は変更しない）。
// 選択肢に無いチーム同士はチーム名の順にして同じチームをまとめる。
// 名前まで同じ場合は、表示が揺れないよう id 順にする
export const sortUserList = <T extends SortableUser>(
  users: readonly T[],
  teamList: readonly string[],
): T[] =>
  [...users].sort(
    (a, b) =>
      classRank(a.class) - classRank(b.class) ||
      teamRank(a.team, teamList) - teamRank(b.team, teamList) ||
      (a.team ?? "").localeCompare(b.team ?? "", "ja") ||
      a.name.localeCompare(b.name, "ja") ||
      a.id - b.id,
  );
