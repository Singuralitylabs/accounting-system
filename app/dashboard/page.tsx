import { Suspense } from "react";
import DynamicDashboard from "../components/dynamic/DynamicDashboard";
import { LoadingSpinner } from "../components/LoadingSpinner";

const DashboardPage = () => {
  return (
    <main className="p-4">
      <Suspense fallback={<LoadingSpinner />}>
        <DynamicDashboard />
      </Suspense>
    </main>
  );
};

export default DashboardPage;
