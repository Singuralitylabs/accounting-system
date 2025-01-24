import { Suspense } from "react";
import PageTitle from "./components/PageTitle";
import { LoadingSpinner } from "./components/providers/LoadingSpinner";
import DynamicMatterList from "./components/dynamic/DynamicMatterList";

const UserMatterPage = () => {
  return (
    <main>
      <PageTitle title="案件カード" />
      <Suspense fallback={<LoadingSpinner />}>
        <DynamicMatterList />
      </Suspense>
    </main>
  );
};

export default UserMatterPage;
