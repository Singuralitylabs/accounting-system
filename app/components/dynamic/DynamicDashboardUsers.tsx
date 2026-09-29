import { getAllUserInfo } from "@/app/utils/supabase/profiles";
import { getSelectOptions } from "@/app/utils/supabase/selectOptions";
import UserList from "../UserList";

const DynamicDashboardUsers = async () => {
  // Users and team options are independent, so fetch in parallel.
  const [
    { userInfoList, error: userInfoError },
    { options: teamList, error: teamError },
  ] = await Promise.all([getAllUserInfo(), getSelectOptions("team")]);
  // Users are the page's main content and a failure rendered as "0 rows" would go unnoticed; throw to the route error boundary (app/dashboard/users/error.tsx).
  if (userInfoError || !userInfoList) {
    throw new Error("ユーザー情報の取得に失敗しました。");
  }
  // A team options failure shows only the current value in the team column with a notice (teamListError in UserList).
  if (teamError) {
    console.error("チーム情報の取得に失敗しました。", teamError);
  }

  return (
    <UserList
      userList={userInfoList}
      teamList={teamList.map((option) => option.value)}
      teamListError={!!teamError}
    />
  );
};

export default DynamicDashboardUsers;
