import { MatterType } from "@/app/types/types";
import { getUserMatterInfoList } from "@/app/utils/supabase/supabaseServer";
import { MatterCardList } from "../MatterCardList";

const DynamicMatterList = async () => {
  try {
    const matterList = await getUserMatterInfoList();

    const unfixedMatterCount =
      matterList !== null && matterList.length > 0
        ? matterList?.filter((matter: MatterType) => {
            return matter.is_fixed === false;
          }).length
        : 0;

    return (
      <main>
        {unfixedMatterCount > 0 && (
          <div className="text-center py-4 text-red-500 text-xl">
            経理に未申請の案件があります。
            <br className="md:hidden" />
            忘れずご対応ください。
          </div>
        )}
        {matterList ? (
          <MatterCardList matterList={matterList} />
        ) : (
          <div>案件の取得に失敗しました。</div>
        )}
      </main>
    );
  } catch (error) {
    console.error("Error in UserMatterPage:", error);
    return (
      <main>
        <div className="text-center py-4">
          エラーが発生しました。ページを再読み込みしてください。
        </div>
      </main>
    );
  }
};

export default DynamicMatterList;
