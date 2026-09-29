import { redirect } from "next/navigation";

// /dashboard stays the navigation entry point (NAV_ITEMS / NavigationHub) and redirects to /dashboard/users.
const DashboardPage = () => {
  redirect("/dashboard/users");
};

export default DashboardPage;
