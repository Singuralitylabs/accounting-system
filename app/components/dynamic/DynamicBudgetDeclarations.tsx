import { getBudgetDeclarationList } from "@/app/utils/supabase/budgetDeclarations";
import { getBudgetDeclarationReminderSettings } from "@/app/utils/supabase/budgetDeclarationReminderSettings";
import {
  getMemberOptions,
  getProfileInfo,
} from "@/app/utils/supabase/profiles";
import { defaultTargetMonth } from "@/app/utils/budgetDeclaration";
import {
  BUDGET_CLOSING_WRITE_CLASSES,
  hasClassAccess,
} from "@/app/utils/permissions";
import { getBudgetDeclarationClosings } from "@/app/utils/supabase/budgetDeclarationClosings";
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
    { closings, error: closingsError },
  ] = await Promise.all([
    getBudgetDeclarationList(initialMonth),
    getProfileInfo(),
    getMemberOptions(),
    getBudgetDeclarationClosings(),
  ]);

  // Closing state is fetched again on the client when the seed is missing.
  if (closingsError) {
    console.error("事前収支申告の確定状態の取得に失敗しました:", closingsError);
  }

  // Members are auxiliary: on failure still show the list, but disable the form's manager Select (see memberListError; an empty memberList would render existing manager_id values as blank, looking cleared).
  if (memberOptionsError) {
    console.error(
      "事前収支申告の担当者選択肢の取得に失敗しました:",
      memberOptionsError,
    );
  }

  // On failure the role is null, so no team is writable (view-only); still log the cause.
  if (profileError) {
    console.error(
      "事前収支申告フォームの権限判定用プロフィール取得に失敗しました:",
      profileError,
    );
  }

  const canManageReminderSettings = canManageBudgetDeclarationReminderSettings(
    profileInfo?.class,
    profileInfo?.is_teamleader,
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
      profileClass={profileInfo?.class ?? null}
      isTeamleader={profileInfo?.is_teamleader ?? false}
      profileTeam={profileInfo?.team ?? null}
      canCloseMonth={hasClassAccess(
        BUDGET_CLOSING_WRITE_CLASSES,
        profileInfo?.class,
        profileInfo?.is_teamleader,
      )}
      initialClosings={closings ?? null}
      canManageReminderSettings={canManageReminderSettings}
      initialReminderDays={reminderSettings?.days ?? null}
      memberList={(memberOptions ?? []).map((member) => ({
        value: String(member.id),
        label: member.name,
      }))}
      memberListError={!!memberOptionsError}
    />
  );
};

export default DynamicBudgetDeclarations;
