import { getBudgetDeclarationList } from "@/app/utils/supabase/budgetDeclarations";
import { getProfileInfo } from "@/app/utils/supabase/profiles";
import {
  canViewAllBudgetTeams,
  defaultTargetMonth,
} from "@/app/utils/budgetDeclaration";
import BudgetDeclarationList from "../budgetDeclarations/BudgetDeclarationList";

const DynamicBudgetDeclarations = async () => {
  // 初期表示は翌月（毎月20日までに翌月分を申告する運用に合わせる）
  const initialMonth = defaultTargetMonth();
  // getProfileInfo は React cache() 経由で dedupe されるため、
  // getBudgetDeclarationList 内で既に呼ばれていても DB 往復は増えない
  const [{ rows }, { profileInfo }] = await Promise.all([
    getBudgetDeclarationList(initialMonth),
    getProfileInfo(),
  ]);

  return (
    <BudgetDeclarationList
      initialMonth={initialMonth}
      initialData={rows ?? null}
      // シード時刻を渡さないと、TanStack Query が「今取得した」と扱い、
      // GC 後に古い initialData を再取得なしで表示してしまう
      initialDataUpdatedAt={Date.now()}
      canEditAllTeams={canViewAllBudgetTeams(profileInfo?.class)}
    />
  );
};

export default DynamicBudgetDeclarations;
