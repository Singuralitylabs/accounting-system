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

/**
 * 案件作成時の合計請求額。`amount` が falsy（null / 0）の行は足さない。
 * `addMatterInfo` の既存 reduce と同一。
 */
export const sumBusinessAmounts = (businessList: AmountRow[]) =>
  businessList.reduce((acc, business) => {
    return business.amount ? acc + business.amount : acc;
  }, 0);

/**
 * 案件作成時の合計コスト。`price` が falsy の行は足さない。
 * `addMatterInfo` の既存 reduce と同一。
 */
export const sumCostPrices = (costList: PriceRow[]) =>
  costList.reduce((acc, cost) => {
    return cost.price ? acc + cost.price : acc;
  }, 0);

/**
 * 案件更新時の集計。`isRemoved` 行は件数・金額から除外する。
 * 未確認コストは「残っている行のうち、未完了または新規行」。
 * `editMatterInfo` の `updateMatter` と同一。
 * 金額は `sumBusinessAmounts` / `sumCostPrices` に集約する。
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

/** 案件作成時の合計。`isRemoved` の無い作成経路なので edit 集計の部分集合。 */
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
