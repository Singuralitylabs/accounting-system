import NavigationHub from "./components/NavigationHub";
import { visibleNavItems } from "./utils/permissions";
import { getCachedProfileInfo } from "./utils/supabase/requestCache";

const HomePage = async () => {
  const { profileInfo, error } = await getCachedProfileInfo();
  const items = visibleNavItems(error ? null : profileInfo?.class);

  return (
    <main className="bg-slate-50 min-h-[60vh] px-4 pb-12 pt-6">
      <h1 className="sr-only">ページ一覧</h1>
      <NavigationHub items={items} />
    </main>
  );
};

export default HomePage;
