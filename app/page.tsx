import { headers } from "next/headers";
import { MatterCardsGrid } from "./components/MatterCard";
import PageTitle from "./components/PageTitle";
import { getUserMatterInfoList } from "./utils/supabaseServer";

export const dynamic = "force-dynamic";

const UserMatterPage = async () => {
  headers();
  try {
    const matterList = await getUserMatterInfoList();

    return (
      <main>
        <PageTitle title="案件カード" />
        {matterList ? (
          <MatterCardsGrid matterList={matterList} />
        ) : (
          <div>案件の取得に失敗しました。</div>
        )}
      </main>
    );
  } catch (error) {
    console.error("Error in UserMatterPage:", error);
    return (
      <main>
        <PageTitle title="案件カード" />
        <div className="text-center py-4">
          エラーが発生しました。ページを再読み込みしてください。
        </div>
      </main>
    );
  }
};

export default UserMatterPage;
