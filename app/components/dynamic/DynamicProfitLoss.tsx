import { getProfitLossReport } from "@/app/utils/supabase/profitLossReport";
import { currentJstMonth } from "@/app/utils/formatter";
import { getCachedProfileInfo } from "@/app/utils/supabase/requestCache";
import { hasClassAccess, ROUTE_PERMISSIONS } from "@/app/utils/permissions";
import ProfitLossView from "../profitLoss/ProfitLossView";

const DynamicProfitLoss = async () => {
  const initialMonth = currentJstMonth();
  const [initialReport, { profileInfo, error }] = await Promise.all([
    getProfitLossReport(initialMonth),
    getCachedProfileInfo(),
  ]);
  // 定期費用マスタ・経理追加収支への管理リンクの表示可否。取得失敗時は
  // 未認可（false）にフォールバックする（フェイルクローズ）
  const canEditMasters = hasClassAccess(
    ROUTE_PERMISSIONS["/recurring-costs"],
    error ? null : profileInfo?.class,
  );

  return (
    <main>
      <ProfitLossView
        initialMonth={initialMonth}
        initialReport={initialReport}
        canEditMasters={canEditMasters}
      />
    </main>
  );
};

export default DynamicProfitLoss;
