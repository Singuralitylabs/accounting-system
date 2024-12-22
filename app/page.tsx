import { headers } from "next/headers";
import { MatterCardsGrid } from "./components/MatterCard";
import PageTitle from "./components/PageTitle";
import { getUserMatterInfoList } from "./utils/supabaseServer";

export const dynamic = "force-dynamic";

const UserMatterPage = async () => {
  headers();
  try {
    const matterList = await getUserMatterInfoList();

    const unfixedMatterCount =
      matterList !== null && matterList.length > 0
        ? matterList?.filter((matter) => {
            return matter.is_fixed === false;
          }).length
        : 0;

    return (
      <main>
        <PageTitle title="案件カード" />
        {unfixedMatterCount > 0 && (
          <div className="text-center py-4 text-red-500 text-xl">
            経理に未申請の案件があります。忘れずご対応ください。
          </div>
        )}
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
