import { Suspense } from "react";
import PageTitle from "../components/PageTitle";
import { LoadingSpinner } from "../components/providers/LoadingSpinner";
import DynamicNew from "../components/dynamic/DynamicNew";

const NewMatterPage = () => {
  return (
    <main className="bg-slate-50">
      <PageTitle title="新規案件の作成" />
      <Suspense fallback={<LoadingSpinner />}>
        <DynamicNew />
      </Suspense>
    </main>
  );
};

export default NewMatterPage;
