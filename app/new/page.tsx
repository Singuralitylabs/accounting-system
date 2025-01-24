import { Suspense } from "react";
import PageTitle from "../components/PageTitle";
import { LoadingSpinner } from "../components/providers/LoadingSpinner";
import NewMatterForm from "../components/NewMatterForm";

const NewMatterPage = () => {
  return (
    <main className="bg-slate-50">
      <PageTitle title="新規案件の作成" />
      <Suspense fallback={<LoadingSpinner />}>
        <NewMatterForm />
      </Suspense>
    </main>
  );
};

export default NewMatterPage;
