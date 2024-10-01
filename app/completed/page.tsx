import { MatterCardsGrid } from "../components/MatterCard";
import PageTitle from "../components/PageTitle";
import { getCompletedUserMatterInfoList } from "../utils/supabaseServer";

// 明示的に動的なページに設定する
export const dynamic = "force-dynamic";

const CompletedUserMatterPage = async () => {
  const matterList = await getCompletedUserMatterInfoList();

  return (
    <main>
      <PageTitle title="完了済み案件一覧" />
      {matterList ? (
        <MatterCardsGrid matterList={matterList} />
      ) : (
        <div>案件の取得に失敗しました。</div>
      )}
    </main>
  );
};

export default CompletedUserMatterPage;
