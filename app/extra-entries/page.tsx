import PageTitle from "../components/PageTitle";
import { Suspense } from "react";
import DynamicExtraEntries from "../components/dynamic/DynamicExtraEntries";
import { LoadingSpinner } from "../components/LoadingSpinner";

type Props = {
  searchParams?: { month?: string };
};

const ExtraEntriesPage = ({ searchParams }: Props) => {
  return (
    <main>
      <div className="px-4 pt-6">
        <PageTitle title="経理追加収支" />
      </div>
      <Suspense fallback={<LoadingSpinner />}>
        <DynamicExtraEntries monthParam={searchParams?.month} />
      </Suspense>
    </main>
  );
};

export default ExtraEntriesPage;
