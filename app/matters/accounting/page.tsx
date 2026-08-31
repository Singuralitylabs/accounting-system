import PageTitle from "../../components/PageTitle";
import { Suspense } from "react";
import DynamicAccounting from "../../components/dynamic/DynamicAccounting";
import { LoadingSpinner } from "../../components/LoadingSpinner";

const AccountingMatterPage = () => {
  return (
    <main>
      <PageTitle title="経理用 案件一覧" />
      <Suspense fallback={<LoadingSpinner />}>
        <DynamicAccounting />
      </Suspense>
    </main>
  );
};

export default AccountingMatterPage;
