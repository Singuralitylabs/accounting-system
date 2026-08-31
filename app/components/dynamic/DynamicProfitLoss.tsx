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
  // 定期費用マスタ・経理追加収支への管理リンクの表示可否。それぞれのルートの
  // ROUTE_PERMISSIONS を個別に見る（ロール定義がルートごとに変わっても UI が
  // 追従するよう、単一のフラグに丸めない）。取得失敗時は未認可（false）に
  // フォールバックする（フェイルクローズ）
  const profileClass = error ? null : profileInfo?.class;
  const canEditRecurringCosts = hasClassAccess(
    ROUTE_PERMISSIONS["/recurring-costs"],
    profileClass,
  );
  const canEditExtraEntries = hasClassAccess(
    ROUTE_PERMISSIONS["/extra-entries"],
    profileClass,
  );

  return (
    <main>
      <ProfitLossView
        initialMonth={initialMonth}
        initialReport={initialReport}
        canEditRecurringCosts={canEditRecurringCosts}
        canEditExtraEntries={canEditExtraEntries}
      />
    </main>
  );
};

export default DynamicProfitLoss;
