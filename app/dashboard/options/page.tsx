import { Suspense } from "react";
import DynamicDashboardOptions from "../../components/dynamic/DynamicDashboardOptions";
import { LoadingSpinner } from "../../components/LoadingSpinner";

const DashboardOptionsPage = () => {
  return (
    <main className="p-4">
      <h1 className="sr-only">管理画面（項目管理）</h1>
      <Suspense fallback={<LoadingSpinner />}>
        <DynamicDashboardOptions />
      </Suspense>
    </main>
  );
};

export default DashboardOptionsPage;
