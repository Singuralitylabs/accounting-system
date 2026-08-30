import { getRecurringCostList } from "@/app/utils/supabase/recurringCosts";
import { getSelectOptions } from "@/app/utils/supabase/selectOptions";
import RecurringCostList from "../recurringCosts/RecurringCostList";

const DynamicRecurringCosts = async () => {
  const [
    { recurringCostList, error: recurringCostError },
    itemResult,
    teamResult,
  ] = await Promise.all([
    getRecurringCostList(),
    getSelectOptions("item"),
    getSelectOptions("team"),
  ]);

  // 取得に失敗した結果を空配列として initialData に渡すと「0 件」と区別が付かず、
  // 成功結果としてキャッシュされてしまう。失敗時は throw して
  // ルートの error boundary（app/recurring-costs/error.tsx）に処理させる。
  if (recurringCostError || !recurringCostList) {
    throw new Error("定期費用情報の取得に失敗しました。");
  }

  const optionsError = itemResult.error ?? teamResult.error;
  if (optionsError) {
    throw new Error("選択肢情報の取得に失敗しました。");
  }

  const itemList = itemResult.options.map((option) => option.value);
  const teamList = teamResult.options.map((option) => option.value);

  return (
    <main>
      <RecurringCostList
        initialData={recurringCostList}
        itemList={itemList}
        teamList={teamList}
      />
    </main>
  );
};

export default DynamicRecurringCosts;
