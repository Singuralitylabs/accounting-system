import { Suspense } from "react";
import DynamicAccounting from "../../components/dynamic/DynamicAccounting";
import { LoadingSpinner } from "../../components/LoadingSpinner";

const AccountingMatterPage = () => {
  return (
    <main className="pt-6">
      <h1 className="sr-only">経理用 案件一覧</h1>
      <Suspense fallback={<LoadingSpinner />}>
        <DynamicAccounting />
      </Suspense>
    </main>
  );
};

export default AccountingMatterPage;
