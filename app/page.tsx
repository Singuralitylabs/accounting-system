import { MatterCardList } from "./components/MatterCardList";
import PageTitle from "./components/PageTitle";
import {
  getSelectOptions,
  getUserMatterInfoList,
} from "./utils/supabaseServer";

const UserMatterPage = async () => {
  try {
    const matterList = await getUserMatterInfoList();

    const unfixedMatterCount =
      matterList !== null && matterList.length > 0
        ? matterList?.filter((matter) => {
            return matter.is_fixed === false;
          }).length
        : 0;

    const { options: teamList } = await getSelectOptions("team");
    const { options: categoryList } = await getSelectOptions("category");
    const { options: itemList } = await getSelectOptions("item");
    const { options: certificateList } = await getSelectOptions("certificate");

    return (
      <main>
        <PageTitle title="案件カード" />
        {unfixedMatterCount > 0 && (
          <div className="text-center py-4 text-red-500 text-xl">
            経理に未申請の案件があります。
            <br className="md:hidden" />
            忘れずご対応ください。
          </div>
        )}
        {matterList ? (
          <MatterCardList
            matterList={matterList}
            teamList={teamList.map((team) => team.value)}
            categoryList={categoryList.map((category) => category.value)}
            itemList={itemList.map((item) => item.value)}
            certificateList={certificateList.map(
              (certificate) => certificate.value
            )}
          />
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
