import { Suspense } from "react";
import DynamicMatterList from "../components/dynamic/DynamicMatterList";
import { LoadingSpinner } from "../components/LoadingSpinner";

const UserMatterPage = () => {
  return (
    <main className="pt-6">
      <Suspense fallback={<LoadingSpinner />}>
        <DynamicMatterList />
      </Suspense>
    </main>
  );
};

export default UserMatterPage;
