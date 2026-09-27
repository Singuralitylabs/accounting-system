import { Suspense } from "react";
import PageTitle from "../../components/PageTitle";
import DynamicBudgetRecurringItems from "../../components/dynamic/DynamicBudgetRecurringItems";
import { LoadingSpinner } from "../../components/LoadingSpinner";

const BudgetRecurringItemsPage = () => {
  return (
    <main>
      <div className="mx-auto max-w-6xl px-4 pt-6">
        <PageTitle title="定期明細" />
      </div>
      <Suspense fallback={<LoadingSpinner />}>
        <DynamicBudgetRecurringItems />
      </Suspense>
    </main>
  );
};

export default BudgetRecurringItemsPage;
