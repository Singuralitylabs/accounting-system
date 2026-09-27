import { Suspense } from "react";
import DynamicAccounting from "../../components/dynamic/DynamicAccounting";
import { LoadingSpinner } from "../../components/LoadingSpinner";

const AccountingMatterPage = () => {
  return (
    <main className="pt-6">
      <Suspense fallback={<LoadingSpinner />}>
        <DynamicAccounting />
      </Suspense>
    </main>
  );
};

export default AccountingMatterPage;
