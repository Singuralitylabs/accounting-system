import { Suspense } from "react";
import PageTitle from "../../components/PageTitle";
import DynamicBudgetRecurringItems from "../../components/dynamic/DynamicBudgetRecurringItems";
import { LoadingSpinner } from "../../components/LoadingSpinner";

const BudgetRecurringItemsPage = () => {
  return (
    <main>
      <PageTitle title="定期明細" className="mx-auto max-w-6xl px-4 pt-6" />
      <Suspense fallback={<LoadingSpinner />}>
        <DynamicBudgetRecurringItems />
      </Suspense>
    </main>
  );
};

export default BudgetRecurringItemsPage;
