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
  // 初期表示は翌月（毎月20日までに翌月分を申告する運用に合わせる）
  const initialMonth = defaultTargetMonth();
  // getProfileInfo は React cache() 経由で dedupe されるため、
  // getBudgetDeclarationList 内で既に呼ばれていても DB 往復は増えない
  const [
    { rows },
    { profileInfo, error: profileError },
    { memberOptions, error: memberOptionsError },
  ] = await Promise.all([
    getBudgetDeclarationList(initialMonth),
    getProfileInfo(),
    getMemberOptions(),
  ]);

  // 担当者選択肢は補助的な入力項目のため、取得に失敗しても一覧自体は表示する。
  // ただしフォーム側の担当者 Select は disabled にする（memberListError 参照）。
  // memberList が空のまま表示すると、既存明細の manager_id が選択肢に無いため
  // Select が空欄に描画され、値は保持されているにもかかわらず「担当者が
  // クリアされた」と利用者に誤認させてしまう
  if (memberOptionsError) {
    console.error(
      "事前収支申告の担当者選択肢の取得に失敗しました:",
      memberOptionsError,
    );
  }

  // 取得失敗時は canEditAllTeams が false（チーム固定）側にフォールバックする。
  // 経理・管理者が対象でも、失敗の原因を追えるようログだけは残す
  if (profileError) {
    console.error(
      "事前収支申告フォームの権限判定用プロフィール取得に失敗しました:",
      profileError,
    );
  }

  const canManageReminderSettings = canManageBudgetDeclarationReminderSettings(
    profileInfo?.class,
  );

  // リマインド設定セクションは admin / accounting にのみ描画するため、
  // 対象外のロールでは Server Action 自体を呼ばない
  // （teamleader / public に権限不足のログを残さない）
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
      // シード時刻を渡さないと、TanStack Query が「今取得した」と扱い、
      // GC 後に古い initialData を再取得なしで表示してしまう
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
