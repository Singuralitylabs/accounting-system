import { getAllUserInfo, getSelectOptions } from "@/app/utils/supabaseServer";
import UserList from "../UserList";
import { Title } from "@mantine/core";
import SelectOptionList from "../SelectOptionList";

const DynamicDashboard = async () => {
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
      <UserList userList={userList} />
      <div className="p-4">
        <Title order={2} className="py-4">
          項目管理
        </Title>
        <div className="md:flex justify-between gap-8">
          <div className="flex-1 pb-4">
            {!teamError ? (
              <SelectOptionList optionClass="team" optionList={teamList} />
            ) : (
              <div>チーム情報の取得に失敗しました。</div>
            )}
          </div>
          <div className="flex-1 pb-4">
            {!categoryError ? (
              <SelectOptionList
                optionClass="category"
                optionList={categoryList}
              />
            ) : (
              <div>カテゴリ情報の取得に失敗しました。</div>
            )}
          </div>
          <div className="flex-1 pb-4">
            {!itemError ? (
              <SelectOptionList optionClass="item" optionList={itemList} />
            ) : (
              <div>アイテム情報の取得に失敗しました。</div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
};

export default DynamicDashboard;
