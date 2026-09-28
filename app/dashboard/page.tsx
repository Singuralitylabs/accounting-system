import { redirect } from "next/navigation";

// 管理画面はユーザー管理（/dashboard/users）と項目管理（/dashboard/options）に分かれている。
// ナビゲーション（NAV_ITEMS / NavigationHub）の入口は /dashboard のままとし、ここで
// ユーザー管理へリダイレクトする
const DashboardPage = () => {
  redirect("/dashboard/users");
};

export default DashboardPage;
