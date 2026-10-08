import { getBudgetRecurringItemList } from "@/app/utils/supabase/budgetRecurringItems";
import {
  getMemberOptions,
  getProfileInfo,
} from "@/app/utils/supabase/profiles";
import { getSelectOptions } from "@/app/utils/supabase/selectOptions";
import { canWriteAllBudgetTeams } from "@/app/utils/budgetDeclaration";
import BudgetRecurringItemList from "../budgetDeclarations/BudgetRecurringItemList";

const DynamicBudgetRecurringItems = async () => {
  const [
    { items, error: itemsError },
    teamResult,
    { profileInfo, error: profileError },
    { memberOptions, error: memberOptionsError },
  ] = await Promise.all([
    getBudgetRecurringItemList(),
    getSelectOptions("team"),
    getProfileInfo(),
    getMemberOptions(),
  ]);

  // Do not pass a failed result as an empty initialData (indistinguishable from 0 rows and cached as success); throw to the route error boundary (app/budget-declarations/error.tsx).
  if (itemsError || !items) {
    throw new Error("定期明細の取得に失敗しました。");
  }
  if (teamResult.error) {
    throw new Error("チーム選択肢の取得に失敗しました。");
  }

  if (memberOptionsError) {
    console.error(
      "定期明細の担当者選択肢の取得に失敗しました:",
      memberOptionsError,
    );
  }
  if (profileError) {
    console.error(
      "定期明細フォームの権限判定用プロフィール取得に失敗しました:",
      profileError,
    );
  }

  return (
    <BudgetRecurringItemList
      initialData={items}
      canEditAllTeams={canWriteAllBudgetTeams(
        profileInfo?.class,
        profileInfo?.is_teamleader,
      )}
      ownTeam={profileInfo?.team ?? null}
      teamList={teamResult.options.map((option) => option.value)}
      memberList={(memberOptions ?? []).map((member) => ({
        value: String(member.id),
        label: member.name,
      }))}
      memberListError={!!memberOptionsError}
      profileLoadFailed={!!profileError || !profileInfo}
    />
  );
};

export default DynamicBudgetRecurringItems;
