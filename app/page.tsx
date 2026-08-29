import PageTitle from "./components/PageTitle";
import NavigationHub from "./components/NavigationHub";
import { visibleNavItems } from "./utils/permissions";
import { getCachedProfileInfo } from "./utils/supabase/requestCache";

const HomePage = async () => {
  const { profileInfo, error } = await getCachedProfileInfo();
  const items = visibleNavItems(error ? null : profileInfo?.class);

  return (
    <main className="bg-slate-50 min-h-[60vh] px-4 pb-12">
      <PageTitle title="ページ一覧" />
      <NavigationHub items={items} />
    </main>
  );
};

export default HomePage;
