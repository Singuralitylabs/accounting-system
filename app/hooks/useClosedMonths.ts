import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { getClosedMonths } from "../utils/supabase/profitLossClosedMonths";

// Key prefix matches ["profitLoss"] so it is invalidated together with the statement cache.
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
