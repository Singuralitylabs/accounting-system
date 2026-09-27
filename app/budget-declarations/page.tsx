import { Suspense } from "react";
import PageTitle from "../components/PageTitle";
import DynamicBudgetDeclarations from "../components/dynamic/DynamicBudgetDeclarations";
import { LoadingSpinner } from "../components/LoadingSpinner";

const BudgetDeclarationsPage = () => {
  return (
    <main>
      <div className="mx-auto max-w-5xl px-4 pt-6">
        <PageTitle title="事前収支申告" />
      </div>
      <Suspense fallback={<LoadingSpinner />}>
        <DynamicBudgetDeclarations />
      </Suspense>
    </main>
  );
};

export default BudgetDeclarationsPage;
