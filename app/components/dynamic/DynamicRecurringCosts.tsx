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

  // Do not pass a failed result as an empty initialData (indistinguishable from 0 rows, cached as success); throw to the route error boundary (app/recurring-costs/error.tsx).
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
