import { getBudgetDeclarationList } from "@/app/utils/supabase/budgetDeclarations";
import { getBudgetDeclarationReminderSettings } from "@/app/utils/supabase/budgetDeclarationReminderSettings";
import {
  getMemberOptions,
  getProfileInfo,
} from "@/app/utils/supabase/profiles";
import {
  canViewAllBudgetTeams,
  defaultTargetMonth,
} from "@/app/utils/budgetDeclaration";
import { canManageBudgetDeclarationReminderSettings } from "@/app/utils/budgetDeclarationReminder";
import BudgetDeclarationList from "../budgetDeclarations/BudgetDeclarationList";

const DynamicBudgetDeclarations = async () => {
  // Initial month is next month (declarations for the next month are due by the 20th).
  const initialMonth = defaultTargetMonth();
  // getProfileInfo is deduped via React cache(), so no extra DB round trip.
  const [
    { rows },
    { profileInfo, error: profileError },
    { memberOptions, error: memberOptionsError },
  ] = await Promise.all([
    getBudgetDeclarationList(initialMonth),
    getProfileInfo(),
    getMemberOptions(),
  ]);

  // Members are auxiliary: on failure still show the list, but disable the form's manager Select (see memberListError; an empty memberList would render existing manager_id values as blank, looking cleared).
  if (memberOptionsError) {
    console.error(
      "事前収支申告の担当者選択肢の取得に失敗しました:",
      memberOptionsError,
    );
  }

  // On failure canEditAllTeams falls back to false (team fixed); still log the cause.
  if (profileError) {
    console.error(
      "事前収支申告フォームの権限判定用プロフィール取得に失敗しました:",
      profileError,
    );
  }

  const canManageReminderSettings = canManageBudgetDeclarationReminderSettings(
    profileInfo?.class,
  );

  // The reminder settings button renders for admin / accounting only, so do not call the Server Action for other roles (avoids permission-denied logs).
  const reminderSettings = canManageReminderSettings
    ? await getBudgetDeclarationReminderSettings()
    : null;

  if (reminderSettings?.error) {
    console.error(
      "事前収支申告リマインド設定の取得に失敗しました:",
      reminderSettings.error,
    );
  }

  return (
    <BudgetDeclarationList
      initialMonth={initialMonth}
      initialData={rows ?? null}
      // Without the seed time TanStack Query treats initialData as fetched now and shows stale data after GC without refetching.
      initialDataUpdatedAt={Date.now()}
      canEditAllTeams={canViewAllBudgetTeams(profileInfo?.class)}
      canManageReminderSettings={canManageReminderSettings}
      initialReminderTargetDays={reminderSettings?.targetDays ?? null}
      memberList={(memberOptions ?? []).map((member) => ({
        value: String(member.id),
        label: member.name,
      }))}
      memberListError={!!memberOptionsError}
    />
  );
};

export default DynamicBudgetDeclarations;
