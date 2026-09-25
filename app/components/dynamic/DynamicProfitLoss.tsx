import { getProfitLossReport } from "@/app/utils/supabase/profitLossReport";
import { currentJstMonth } from "@/app/utils/formatter";
import { getCachedProfileInfo } from "@/app/utils/supabase/requestCache";
import {
  hasClassAccess,
  PL_ADJUSTMENT_WRITE_CLASSES,
  ROUTE_PERMISSIONS,
} from "@/app/utils/permissions";
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
  // 損益調整（実績額修正）の操作を表示するか。専用ルートを持たないため
  // PL_ADJUSTMENT_WRITE_CLASSES を直接見る（RLS の accounting/admin 判定と揃える）
  const canEditAdjustments = hasClassAccess(
    PL_ADJUSTMENT_WRITE_CLASSES,
    profileClass,
  );

  return (
    <main>
      <ProfitLossView
        initialMonth={initialMonth}
        initialReport={initialReport}
        canEditRecurringCosts={canEditRecurringCosts}
        canEditExtraEntries={canEditExtraEntries}
        canEditAdjustments={canEditAdjustments}
      />
    </main>
  );
};

export default DynamicProfitLoss;
