import { getProfitLossReport } from "@/app/utils/supabase/profitLossReport";
import ProfitLossView from "../profitLoss/ProfitLossView";

// JST 基準の当月キー（YYYY-MM）
const getCurrentJstMonth = () =>
  new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 7);

const DynamicProfitLoss = async () => {
  const initialMonth = getCurrentJstMonth();
  const initialReport = await getProfitLossReport(initialMonth);

  return (
    <main>
      <ProfitLossView
        initialMonth={initialMonth}
        initialReport={initialReport}
      />
    </main>
  );
};

export default DynamicProfitLoss;
