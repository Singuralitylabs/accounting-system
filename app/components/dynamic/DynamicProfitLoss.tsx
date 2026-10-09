import { getProfitLossReport } from "@/app/utils/supabase/profitLossReport";
import { currentJstMonth } from "@/app/utils/formatter";
import { getCachedProfileInfo } from "@/app/utils/supabase/requestCache";
import {
  hasClassAccess,
  PL_ADJUSTMENT_WRITE_CLASSES,
  PL_CLOSING_WRITE_CLASSES,
  PL_LABEL_WRITE_CLASSES,
  ROUTE_PERMISSIONS,
} from "@/app/utils/permissions";
import ProfitLossView from "../profitLoss/ProfitLossView";

const DynamicProfitLoss = async () => {
  const initialMonth = currentJstMonth();
  const [initialReport, { profileInfo, error }] = await Promise.all([
    getProfitLossReport(initialMonth),
    getCachedProfileInfo(),
  ]);
  // Link visibility per route's own ROUTE_PERMISSIONS (not one flag, so the UI follows role changes per route). Fails closed (false) on fetch failure.
  const profileClass = error ? null : profileInfo?.class;
  const isTeamleader = error ? null : profileInfo?.is_teamleader;
  const canEditRecurringCosts = hasClassAccess(
    ROUTE_PERMISSIONS["/recurring-costs"],
    profileClass,
    isTeamleader,
  );
  const canEditExtraEntries = hasClassAccess(
    ROUTE_PERMISSIONS["/extra-entries"],
    profileClass,
    isTeamleader,
  );
  // No dedicated route, so check PL_ADJUSTMENT_WRITE_CLASSES directly (matches RLS accounting/admin).
  const canEditAdjustments = hasClassAccess(
    PL_ADJUSTMENT_WRITE_CLASSES,
    profileClass,
    isTeamleader,
  );
  // Matches RLS accounting/admin.
  const canEditLabels = hasClassAccess(
    PL_LABEL_WRITE_CLASSES,
    profileClass,
    isTeamleader,
  );
  // Matches RLS accounting/admin.
  const canClose = hasClassAccess(
    PL_CLOSING_WRITE_CLASSES,
    profileClass,
    isTeamleader,
  );

  return (
    <main>
      <ProfitLossView
        initialMonth={initialMonth}
        initialReport={initialReport}
        canEditRecurringCosts={canEditRecurringCosts}
        canEditExtraEntries={canEditExtraEntries}
        canEditAdjustments={canEditAdjustments}
        canEditLabels={canEditLabels}
        canClose={canClose}
      />
    </main>
  );
};

export default DynamicProfitLoss;
