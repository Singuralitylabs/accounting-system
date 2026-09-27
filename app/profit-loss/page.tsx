import PageTitle from "../components/PageTitle";
import { Suspense } from "react";
import DynamicProfitLoss from "../components/dynamic/DynamicProfitLoss";
import { LoadingSpinner } from "../components/LoadingSpinner";

const ProfitLossPage = () => {
  return (
    <main>
      <div className="mx-auto max-w-5xl px-4 pt-6">
        <PageTitle title="損益計算書" />
      </div>
      <Suspense fallback={<LoadingSpinner />}>
        <DynamicProfitLoss />
      </Suspense>
    </main>
  );
};

export default ProfitLossPage;
