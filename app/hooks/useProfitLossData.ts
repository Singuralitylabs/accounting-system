import { useQuery } from '@tanstack/react-query';
import {
  getProfitLossReport,
  getAnnualTrend,
} from '../utils/supabase/profitLossReport';
import { AnnualTrendType, PLReportType } from '../types/types';

// 月次損益レポート（month: "YYYY-MM"）
export const useProfitLossReport = (
  month: string,
  initialData?: PLReportType | null
) => {
  return useQuery({
    queryKey: ['profitLoss', 'month', month],
    queryFn: async () => {
      const report = await getProfitLossReport(month);
      // null を成功としてキャッシュすると永久にローディング表示になるため、エラーとして扱う
      if (!report) {
        throw new Error('損益レポートの取得に失敗しました');
      }
      return report;
    },
    // サーバ側の初回取得が失敗（null）した場合はキャッシュせず、クライアントで再取得させる
    initialData: initialData ?? undefined,
    enabled: !!month,
    staleTime: 2 * 60 * 1000, // 2分
  });
};

// 年間推移（fiscalYear: 年度の開始年。2026 = 2026/7〜2027/6）
export const useAnnualTrend = (
  fiscalYear: number,
  initialData?: AnnualTrendType | null,
  enabled = true
) => {
  return useQuery({
    queryKey: ['profitLoss', 'annual', fiscalYear],
    queryFn: async () => {
      const trend = await getAnnualTrend(fiscalYear);
      if (!trend) {
        throw new Error('年間推移の取得に失敗しました');
      }
      return trend;
    },
    initialData: initialData ?? undefined,
    enabled: enabled && !!fiscalYear,
    staleTime: 2 * 60 * 1000,
  });
};
