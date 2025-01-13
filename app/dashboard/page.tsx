import { Title } from "@mantine/core";
import PageTitle from "../components/PageTitle";
import SelectOptionList from "../components/SelectOptionList";
import UserList from "../components/UserList";
import { getAllUserInfo, getSelectOptions } from "../utils/supabaseServer";

const DashboardPage = async () => {
  const userList = await getAllUserInfo();
  const { options: teamList, error: teamError } = await getSelectOptions(
    "team"
  );
  if (teamError) {
    console.error("チーム情報の取得に失敗しました。", teamError);
  }
  const { options: categoryList, error: categoryError } =
    await getSelectOptions("category");
  if (categoryError) {
    console.error("カテゴリ情報の取得に失敗しました。", categoryError);
  }
  const { options: itemList, error: itemError } = await getSelectOptions(
    "item"
  );
  if (itemError) {
    console.error("アイテム情報の取得に失敗しました。", itemError);
  }

  return (
    <main className="p-4">
      <PageTitle title="管理画面" />
      <UserList userList={userList} />
      <Title order={2} className="py-4">
        項目管理
      </Title>
      <div className="flex justify-between gap-4">
        {!teamError ? (
          <SelectOptionList optionClass="team" optionList={teamList} />
        ) : (
          <div>チーム情報の取得に失敗しました。</div>
        )}
        {!categoryError ? (
          <SelectOptionList optionClass="category" optionList={categoryList} />
        ) : (
          <div>カテゴリ情報の取得に失敗しました。</div>
        )}
        <SelectOptionList optionClass="item" optionList={itemList} />
      </div>
    </main>
  );
};

export default DashboardPage;
