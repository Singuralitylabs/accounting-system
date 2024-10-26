import PageTitle from "../components/PageTitle";
import { DashboardMatterList } from "../components/DashboardMatterList";
import { getAllMatterInfoList } from "../utils/supabaseServer";

const DashboardMatterPage = async () => {
  const matterList = await getAllMatterInfoList();

  return (
    <main>
      <PageTitle title="経理用 案件一覧" />
      <DashboardMatterList matterList={matterList} />
    </main>
  );
};

export default DashboardMatterPage;
