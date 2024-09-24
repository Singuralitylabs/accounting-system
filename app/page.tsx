import { MatterCardsGrid } from "./components/MatterCard";
import PageTitle from "./components/PageTitle";
import { getUserMatterInfoList } from "./utils/supabaseServer";

// 明示的に動的なページに設定する
export const dynamic = "force-dynamic";

const UserMatterPage = async () => {
  const matterList = await getUserMatterInfoList();

  return (
    <main>
      <PageTitle title="案件一覧" />
      {matterList ? (
        <MatterCardsGrid matterList={matterList} />
      ) : (
        <div>案件の取得に失敗しました。</div>
      )}
    </main>
  );
};

export default UserMatterPage;
