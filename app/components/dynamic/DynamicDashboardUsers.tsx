import { getAllUserInfo } from "@/app/utils/supabase/profiles";
import { getSelectOptions } from "@/app/utils/supabase/selectOptions";
import UserList from "../UserList";

// 管理画面のユーザー管理（/dashboard/users）
const DynamicDashboardUsers = async () => {
  // ユーザー一覧とチームの選択肢は互いに独立なので並列に取得する
  const [
    { userInfoList, error: userInfoError },
    { options: teamList, error: teamError },
  ] = await Promise.all([getAllUserInfo(), getSelectOptions("team")]);
  // ユーザー一覧はこのページの主要コンテンツであり、取得失敗を「0 件」として
  // 描画すると利用者が気付けない。失敗時は throw して
  // ルートの error boundary（app/dashboard/users/error.tsx）に処理させる。
  if (userInfoError || !userInfoList) {
    throw new Error("ユーザー情報の取得に失敗しました。");
  }
  // チームの選択肢の取得失敗は画面全体のエラーにせず、チーム欄に現在の値だけを出して
  // その旨を表示する（UserList の teamListError）
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
