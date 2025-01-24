import { Suspense } from "react";
import PageTitle from "../components/PageTitle";
import NewMatterForm from "../components/NewMatterForm";
import { LoadingSpinner } from "../components/LoadingSpinner";

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
