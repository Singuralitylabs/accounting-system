import { ReactNode } from "react";
import DashboardNav from "../components/dashboard/DashboardNav";
import { DashboardUnsavedChangesProvider } from "../components/dashboard/DashboardUnsavedChanges";

// Shell shared by /dashboard/users and /dashboard/options: side menu + content on PC, top tabs on mobile. Role protection applies to subroutes via prefix match of ROUTE_PERMISSIONS["/dashboard"] in middleware. Unsaved state is shared via DashboardUnsavedChangesProvider and confirmed before switching from the menu.
const DashboardLayout = ({ children }: { children: ReactNode }) => {
  return (
    <DashboardUnsavedChangesProvider>
      <div className="md:flex md:min-h-[60vh]">
        <DashboardNav />
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </DashboardUnsavedChangesProvider>
  );
};

export default DashboardLayout;
