import { ReactNode } from "react";
import DashboardNav from "../components/dashboard/DashboardNav";

// 管理画面（/dashboard/users・/dashboard/options）で共有するシェル。
// PC は左にサイドメニュー・右にコンテンツの 2 カラム、モバイルは上部のタブ＋コンテンツ。
// ロール保護は middleware（ROUTE_PERMISSIONS["/dashboard"] の前方一致）がサブルートにも効く
const DashboardLayout = ({ children }: { children: ReactNode }) => {
  return (
    <div className="md:flex md:min-h-[60vh]">
      <DashboardNav />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
};

export default DashboardLayout;
