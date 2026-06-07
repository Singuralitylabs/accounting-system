import PageTitle from "../components/PageTitle";
import { Suspense } from "react";
import DynamicExtraEntries from "../components/dynamic/DynamicExtraEntries";
import { LoadingSpinner } from "../components/LoadingSpinner";

const ExtraEntriesPage = () => {
  return (
    <main>
      <PageTitle title="経理追加収支" />
      <Suspense fallback={<LoadingSpinner />}>
        <DynamicExtraEntries />
      </Suspense>
    </main>
  );
};

export default ExtraEntriesPage;
