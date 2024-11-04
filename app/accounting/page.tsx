import PageTitle from "../components/PageTitle";
import { AccountingMatterList } from "../components/AccountingMatterList";
import { getAllMatterInfoList } from "../utils/supabaseServer";

export const dynamic = "force-dynamic";

const AccountingMatterPage = async () => {
  const matterList = await getAllMatterInfoList();

  return (
    <main>
      <PageTitle title="経理用 案件一覧" />
      <AccountingMatterList matterList={matterList} />
    </main>
  );
};

export default AccountingMatterPage;
