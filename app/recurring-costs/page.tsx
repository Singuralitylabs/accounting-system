import PageTitle from "../components/PageTitle";
import { Suspense } from "react";
import DynamicRecurringCosts from "../components/dynamic/DynamicRecurringCosts";
import { LoadingSpinner } from "../components/LoadingSpinner";

const RecurringCostsPage = () => {
  return (
    <main>
      <div className="mx-auto max-w-6xl px-4 pt-6">
        <PageTitle title="定期費用マスタ" />
      </div>
      <Suspense fallback={<LoadingSpinner />}>
        <DynamicRecurringCosts />
      </Suspense>
    </main>
  );
};

export default RecurringCostsPage;
