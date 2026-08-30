import PageTitle from "../components/PageTitle";
import { Suspense } from "react";
import DynamicProfitLoss from "../components/dynamic/DynamicProfitLoss";
import { LoadingSpinner } from "../components/LoadingSpinner";

const ProfitLossPage = () => {
  return (
    <main>
      <PageTitle title="損益計算書" />
      <Suspense fallback={<LoadingSpinner />}>
        <DynamicProfitLoss />
      </Suspense>
    </main>
  );
};

export default ProfitLossPage;
