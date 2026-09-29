import { Suspense } from "react";
import DynamicDashboardOptions from "../../components/dynamic/DynamicDashboardOptions";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import PageTitle from "../../components/PageTitle";

const DashboardOptionsPage = () => {
  return (
    <main className="mx-auto max-w-5xl p-4">
      <PageTitle title="項目管理" />
      <p className="-mt-2 pb-4 text-sm text-gray-600">
        案件や追加収支の入力画面で選ぶ選択肢を編集します。並び順は入力画面の選択肢の順になります。
      </p>
      <Suspense fallback={<LoadingSpinner />}>
        <DynamicDashboardOptions />
      </Suspense>
    </main>
  );
};

export default DashboardOptionsPage;
