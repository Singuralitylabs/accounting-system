import { Suspense } from "react";
import PageTitle from "./components/PageTitle";
import DynamicMatterList from "./components/dynamic/DynamicMatterList";
import { LoadingSpinner } from "./components/LoadingSpinner";

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
