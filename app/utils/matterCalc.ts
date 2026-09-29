import type {
  BusinessInCardType,
  BusinessType,
  CostInCardType,
  CostType,
} from "../types/types";

type AmountRow = Pick<BusinessType, "amount">;

type PriceRow = {
  price: CostType["price"] | null;
};

type EditableBusiness = AmountRow &
  Pick<Partial<BusinessInCardType>, "isRemoved">;

type EditableCost = PriceRow &
  Pick<Partial<CostInCardType>, "isRemoved" | "is_completed" | "isNew">;

/** Skips rows whose `amount` is falsy (null / 0). */
export const sumBusinessAmounts = (businessList: AmountRow[]) =>
  businessList.reduce((acc, business) => {
    return business.amount ? acc + business.amount : acc;
  }, 0);

/** Skips rows whose `price` is falsy. */
export const sumCostPrices = (costList: PriceRow[]) =>
  costList.reduce((acc, cost) => {
    return cost.price ? acc + cost.price : acc;
  }, 0);

/**
 * Excludes `isRemoved` rows. Unconfirmed costs = remaining rows that are incomplete or new.
 * Amounts go through `sumBusinessAmounts` / `sumCostPrices`.
 */
export const calcMatterTotalsForEdit = (
  businessInfoList: EditableBusiness[],
  costInfoList: EditableCost[],
) => {
  const businesses = businessInfoList.filter((business) => !business.isRemoved);
  const costs = costInfoList.filter((cost) => !cost.isRemoved);
  return {
    total_amount: sumBusinessAmounts(businesses),
    business_count: businesses.length,
    total_cost: sumCostPrices(costs),
    cost_count: costs.length,
    unchecked_cost_count: costs.filter(
      (cost) => !cost.is_completed || cost.isNew,
    ).length,
  };
};

/** Create path has no `isRemoved`, so this is a subset of the edit aggregation. */
export const calcMatterTotalsForCreate = (
  businessList: AmountRow[],
  costList: PriceRow[],
) => {
  const { total_amount, total_cost } = calcMatterTotalsForEdit(
    businessList,
    costList,
  );
  return { total_amount, total_cost };
};
