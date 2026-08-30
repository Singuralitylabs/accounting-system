import { getBudgetDeclarationList } from "@/app/utils/supabase/budgetDeclarations";
import { defaultTargetMonth } from "@/app/utils/budgetDeclaration";
import BudgetDeclarationList from "../budgetDeclarations/BudgetDeclarationList";

const DynamicBudgetDeclarations = async () => {
  // 初期表示は翌月（毎月20日までに翌月分を申告する運用に合わせる）
  const initialMonth = defaultTargetMonth();
  // 取得失敗時は null のまま渡し、クライアント側で再取得させる
  // （空配列を initialData にすると「0 件」と区別できず成功としてキャッシュされる）
  const { rows } = await getBudgetDeclarationList(initialMonth);

  return (
    <BudgetDeclarationList
      initialMonth={initialMonth}
      initialData={rows ?? null}
      // シード時刻を渡さないと、TanStack Query が「今取得した」と扱い、
      // GC 後に古い initialData を再取得なしで表示してしまう
      initialDataUpdatedAt={Date.now()}
    />
  );
};

export default DynamicBudgetDeclarations;
