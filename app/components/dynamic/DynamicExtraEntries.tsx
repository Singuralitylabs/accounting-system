import { getExtraEntryList } from "@/app/utils/supabase/extraEntries";
import { getAllUserInfo } from "@/app/utils/supabase/profiles";
import { getSelectOptions } from "@/app/utils/supabase/selectOptions";
import ExtraEntryList from "../extraEntries/ExtraEntryList";

const DynamicExtraEntries = async () => {
  const [
    { extraEntryList, error: extraEntryError },
    incomeCategoryResult,
    expenseCategoryResult,
    paymentMethodResult,
    teamResult,
    { userInfoList, error: userInfoError },
  ] = await Promise.all([
    getExtraEntryList(),
    getSelectOptions("extra_income_category"),
    getSelectOptions("extra_expense_category"),
    getSelectOptions("payment_method"),
    getSelectOptions("team"),
    getAllUserInfo(),
  ]);

  // 取得に失敗した結果を空配列として描画すると「0 件」と区別が付かず、
  // TanStack Query の initialData にも成功結果としてキャッシュされてしまう。
  // 失敗時は throw してルートの error boundary（app/extra-entries/error.tsx）に処理させる。
  if (extraEntryError || !extraEntryList) {
    throw new Error("経理追加収支情報の取得に失敗しました。");
  }

  const optionsError =
    incomeCategoryResult.error ??
    expenseCategoryResult.error ??
    paymentMethodResult.error ??
    teamResult.error;
  if (optionsError) {
    throw new Error("選択肢情報の取得に失敗しました。");
  }

  if (userInfoError || !userInfoList) {
    throw new Error("ユーザー情報の取得に失敗しました。");
  }

  return (
    <main>
      <ExtraEntryList
        initialData={extraEntryList}
        incomeCategoryList={incomeCategoryResult.options.map(
          (option) => option.value,
        )}
        expenseCategoryList={expenseCategoryResult.options.map(
          (option) => option.value,
        )}
        paymentMethodList={paymentMethodResult.options.map(
          (option) => option.value,
        )}
        teamList={teamResult.options.map((option) => option.value)}
        memberList={userInfoList.map((user) => ({
          value: String(user.id),
          label: user.name,
        }))}
      />
    </main>
  );
};

export default DynamicExtraEntries;
