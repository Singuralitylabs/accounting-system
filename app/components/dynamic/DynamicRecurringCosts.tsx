import { getRecurringCostList } from "@/app/utils/supabase/recurringCosts";
import { getSelectOptions } from "@/app/utils/supabase/selectOptions";
import RecurringCostList from "../recurringCosts/RecurringCostList";

const DynamicRecurringCosts = async () => {
  const [{ recurringCostList }, itemResult, teamResult] = await Promise.all([
    getRecurringCostList(),
    getSelectOptions("item"),
    getSelectOptions("team"),
  ]);

  const itemList = itemResult.options.map((option) => option.value);
  const teamList = teamResult.options.map((option) => option.value);

  return (
    <main>
      <RecurringCostList
        initialData={recurringCostList ?? []}
        itemList={itemList}
        teamList={teamList}
      />
    </main>
  );
};

export default DynamicRecurringCosts;
