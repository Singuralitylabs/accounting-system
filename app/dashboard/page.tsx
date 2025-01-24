import { Suspense } from "react";
import { LoadingSpinner } from "../components/providers/LoadingSpinner";
import DynamicDashboard from "../components/dynamic/DynamicDashboard";

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
