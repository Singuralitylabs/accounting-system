import PageTitle from "../components/PageTitle";
import { Suspense } from "react";
import DynamicRecurringCosts from "../components/dynamic/DynamicRecurringCosts";
import { LoadingSpinner } from "../components/LoadingSpinner";

const RecurringCostsPage = () => {
  return (
    <main>
      <PageTitle title="定期費用マスタ" />
      <Suspense fallback={<LoadingSpinner />}>
        <DynamicRecurringCosts />
      </Suspense>
    </main>
  );
};

export default RecurringCostsPage;
