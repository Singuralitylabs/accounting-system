import { getBudgetRecurringItemList } from "@/app/utils/supabase/budgetRecurringItems";
import {
  getMemberOptions,
  getProfileInfo,
} from "@/app/utils/supabase/profiles";
import { getSelectOptions } from "@/app/utils/supabase/selectOptions";
import { canViewAllBudgetTeams } from "@/app/utils/budgetDeclaration";
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

  // 取得に失敗した結果を空配列として initialData に渡すと「0 件」と区別が付かず、
  // 成功結果としてキャッシュされてしまう。失敗時は throw して
  // ルートの error boundary（app/budget-declarations/error.tsx）に処理させる
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
      canEditAllTeams={canViewAllBudgetTeams(profileInfo?.class)}
      ownTeam={profileInfo?.team ?? null}
      teamList={teamResult.options.map((option) => option.value)}
      memberList={(memberOptions ?? []).map((member) => ({
        value: String(member.id),
        label: member.name,
      }))}
      memberListError={!!memberOptionsError}
    />
  );
};

export default DynamicBudgetRecurringItems;
