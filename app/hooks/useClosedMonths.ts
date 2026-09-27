import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { getClosedMonths } from "../utils/supabase/profitLossClosedMonths";

// 確定済みの月（"YYYY-MM"）の一覧（Issue #148）。
// 損益計算書のキャッシュ（["profitLoss"]）と一緒に無効化されるよう、キーの先頭を揃える
export const useClosedMonths = (enabled = true) => {
  const query = useQuery({
    queryKey: ["profitLoss", "closedMonths"],
    queryFn: async () => {
      const result = await getClosedMonths();
      if (result.error) {
        throw new Error(result.error.message);
      }
      return result.months;
    },
    enabled,
    staleTime: 60 * 1000,
  });
  const closedMonths = useMemo(
    () => new Set<string>(query.data ?? []),
    [query.data],
  );
  return { ...query, closedMonths };
};
