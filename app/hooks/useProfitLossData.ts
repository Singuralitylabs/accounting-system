import { useQuery } from "@tanstack/react-query";
import {
  getProfitLossReport,
  getAnnualTrend,
} from "../utils/supabase/profitLossReport";
import { AnnualTrendType, PLReportType } from "../types/types";

export const useProfitLossReport = (
  month: string,
  initialData?: PLReportType | null,
) => {
  return useQuery({
    queryKey: ["profitLoss", "month", month],
    queryFn: async () => {
      const report = await getProfitLossReport(month);
      // Caching null as success would show loading forever.
      if (!report) {
        throw new Error("損益レポートの取得に失敗しました");
      }
      return report;
    },
    // Do not cache a failed server-side initial fetch (null); let the client refetch.
    initialData: initialData ?? undefined,
    enabled: !!month,
    staleTime: 2 * 60 * 1000,
  });
};

export const useAnnualTrend = (
  fiscalYear: number,
  initialData?: AnnualTrendType | null,
  enabled = true,
) => {
  return useQuery({
    queryKey: ["profitLoss", "annual", fiscalYear],
    queryFn: async () => {
      const trend = await getAnnualTrend(fiscalYear);
      if (!trend) {
        throw new Error("年間推移の取得に失敗しました");
      }
      return trend;
    },
    initialData: initialData ?? undefined,
    enabled: enabled && !!fiscalYear,
    staleTime: 2 * 60 * 1000,
  });
};
