import { Suspense } from "react";
import DynamicDashboardUsers from "../../components/dynamic/DynamicDashboardUsers";
import { LoadingSpinner } from "../../components/LoadingSpinner";

const DashboardUsersPage = () => {
  return (
    <main className="p-4">
      <h1 className="sr-only">管理画面（ユーザー管理）</h1>
      <Suspense fallback={<LoadingSpinner />}>
        <DynamicDashboardUsers />
      </Suspense>
    </main>
  );
};

export default DashboardUsersPage;
