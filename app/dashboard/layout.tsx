import { ReactNode } from "react";
import DashboardNav from "../components/dashboard/DashboardNav";
import { DashboardUnsavedChangesProvider } from "../components/dashboard/DashboardUnsavedChanges";

// 管理画面（/dashboard/users・/dashboard/options）で共有するシェル。
// PC は左にサイドメニュー・右にコンテンツの 2 カラム、モバイルは上部のタブ＋コンテンツ。
// ロール保護は middleware（ROUTE_PERMISSIONS["/dashboard"] の前方一致）がサブルートにも効く。
// 未保存の変更の有無は DashboardUnsavedChangesProvider で共有し、メニューからの切り替え前に確認する
const DashboardLayout = ({ children }: { children: ReactNode }) => {
  return (
    <DashboardUnsavedChangesProvider>
      <div className="md:flex md:min-h-[60vh]">
        <DashboardNav />
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </DashboardUnsavedChangesProvider>
  );
};

export default DashboardLayout;
