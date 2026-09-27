import { getAllUserInfo } from "@/app/utils/supabase/profiles";
import { getSelectOptions } from "@/app/utils/supabase/selectOptions";
import UserList from "../UserList";
import { Title } from "@mantine/core";
import SelectOptionList from "../SelectOptionList";

const DynamicDashboard = async () => {
  // ユーザー一覧と選択肢（React.cache で 1 クエリにまとまる）は互いに独立なので並列に取得する
  const [
    { userInfoList, error: userInfoError },
    { options: teamList, error: teamError },
    { options: categoryList, error: categoryError },
    { options: itemList, error: itemError },
    { options: incomeCategoryList, error: incomeCategoryError },
    { options: expenseCategoryList, error: expenseCategoryError },
    { options: paymentMethodList, error: paymentMethodError },
  ] = await Promise.all([
    getAllUserInfo(),
    getSelectOptions("team"),
    getSelectOptions("category"),
    getSelectOptions("item"),
    getSelectOptions("extra_income_category"),
    getSelectOptions("extra_expense_category"),
    getSelectOptions("payment_method"),
  ]);
  // ユーザー一覧はこのページの主要コンテンツであり、取得失敗を「0 件」として
  // 描画すると利用者が気付けない。失敗時は throw して
  // ルートの error boundary（app/dashboard/error.tsx）に処理させる。
  if (userInfoError || !userInfoList) {
    throw new Error("ユーザー情報の取得に失敗しました。");
  }
  if (teamError) {
    console.error("チーム情報の取得に失敗しました。", teamError);
  }
  if (categoryError) {
    console.error("カテゴリ情報の取得に失敗しました。", categoryError);
  }
  if (itemError) {
    console.error("アイテム情報の取得に失敗しました。", itemError);
  }
  if (incomeCategoryError) {
    console.error("収入分類情報の取得に失敗しました。", incomeCategoryError);
  }
  if (expenseCategoryError) {
    console.error("支出分類情報の取得に失敗しました。", expenseCategoryError);
  }
  if (paymentMethodError) {
    console.error("決済方法情報の取得に失敗しました。", paymentMethodError);
  }

  return (
    <main className="p-4">
      <UserList
        userList={userInfoList}
        teamList={teamList.map((option) => option.value)}
        teamListError={!!teamError}
      />
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
