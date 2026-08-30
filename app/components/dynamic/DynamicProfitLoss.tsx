import { getProfitLossReport } from "@/app/utils/supabase/profitLossReport";
import { currentJstMonth } from "@/app/utils/formatter";
import ProfitLossView from "../profitLoss/ProfitLossView";

const DynamicProfitLoss = async () => {
  const initialMonth = currentJstMonth();
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
