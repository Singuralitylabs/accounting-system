import {
  getAllUserInfo,
  getSelectOptions,
} from "@/app/utils/supabase/supabaseServer";
import UserList from "../UserList";
import { Title } from "@mantine/core";
import SelectOptionList from "../SelectOptionList";

const DynamicDashboard = async () => {
  const userList = await getAllUserInfo();
  const { options: teamList, error: teamError } =
    await getSelectOptions("team");
  if (teamError) {
    console.error("チーム情報の取得に失敗しました。", teamError);
  }
  const { options: categoryList, error: categoryError } =
    await getSelectOptions("category");
  if (categoryError) {
    console.error("カテゴリ情報の取得に失敗しました。", categoryError);
  }
  const { options: itemList, error: itemError } =
    await getSelectOptions("item");
  if (itemError) {
    console.error("アイテム情報の取得に失敗しました。", itemError);
  }
  const { options: incomeCategoryList, error: incomeCategoryError } =
    await getSelectOptions("extra_income_category");
  if (incomeCategoryError) {
    console.error("収入分類情報の取得に失敗しました。", incomeCategoryError);
  }
  const { options: expenseCategoryList, error: expenseCategoryError } =
    await getSelectOptions("extra_expense_category");
  if (expenseCategoryError) {
    console.error("支出分類情報の取得に失敗しました。", expenseCategoryError);
  }
  const { options: paymentMethodList, error: paymentMethodError } =
    await getSelectOptions("payment_method");
  if (paymentMethodError) {
    console.error("決済方法情報の取得に失敗しました。", paymentMethodError);
  }

  return (
    <main className="p-4">
      <UserList userList={userList} />
      <div className="p-4">
        <Title order={2} className="py-4">
          項目管理
        </Title>
        <div className="md:grid md:grid-cols-3 md:gap-8">
          <div className="pb-4">
            {!teamError ? (
              <SelectOptionList optionClass="team" optionList={teamList} />
            ) : (
              <div>チーム情報の取得に失敗しました。</div>
            )}
          </div>
          <div className="pb-4">
            {!categoryError ? (
              <SelectOptionList
                optionClass="category"
                optionList={categoryList}
              />
            ) : (
              <div>カテゴリ情報の取得に失敗しました。</div>
            )}
          </div>
          <div className="pb-4">
            {!itemError ? (
              <SelectOptionList optionClass="item" optionList={itemList} />
            ) : (
              <div>アイテム情報の取得に失敗しました。</div>
            )}
          </div>
          <div className="pb-4">
            {!incomeCategoryError ? (
              <SelectOptionList
                optionClass="extra_income_category"
                optionList={incomeCategoryList}
              />
            ) : (
              <div>収入分類情報の取得に失敗しました。</div>
            )}
          </div>
          <div className="pb-4">
            {!expenseCategoryError ? (
              <SelectOptionList
                optionClass="extra_expense_category"
                optionList={expenseCategoryList}
              />
            ) : (
              <div>支出分類情報の取得に失敗しました。</div>
            )}
          </div>
          <div className="pb-4">
            {!paymentMethodError ? (
              <SelectOptionList
                optionClass="payment_method"
                optionList={paymentMethodList}
              />
            ) : (
              <div>決済方法情報の取得に失敗しました。</div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
};

export default DynamicDashboard;
