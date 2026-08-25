type AmountRow = {
  amount?: number | null;
};

type PriceRow = {
  price?: number | null;
};

type EditableBusiness = AmountRow & {
  isRemoved?: boolean;
};

type EditableCost = PriceRow & {
  isRemoved?: boolean;
  is_completed?: boolean | null;
  isNew?: boolean;
};

/**
 * 案件作成時の合計請求額。`amount` が falsy（null / 0 / undefined）の行は足さない。
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

export const calcMatterTotalsForCreate = (
  businessList: AmountRow[],
  costList: PriceRow[],
) => ({
  total_amount: sumBusinessAmounts(businessList),
  total_cost: sumCostPrices(costList),
});

/**
 * 案件更新時の集計。`isRemoved` 行は件数・金額から除外する。
 * 未確認コストは「残っている行のうち、未完了または新規行」。
 * `editMatterInfo` の `updateMatter` と同一。
 */
export const calcMatterTotalsForEdit = (
  businessInfoList: EditableBusiness[],
  costInfoList: EditableCost[],
) => ({
  total_amount: businessInfoList.reduce((acc, business) => {
    return business.amount && !business.isRemoved ? acc + business.amount : acc;
  }, 0),
  business_count: businessInfoList.filter((business) => !business.isRemoved)
    .length,
  total_cost: costInfoList.reduce((acc, cost) => {
    return cost.price && !cost.isRemoved ? acc + cost.price : acc;
  }, 0),
  cost_count: costInfoList.filter((cost) => !cost.isRemoved).length,
  unchecked_cost_count: costInfoList.filter(
    (cost) => !cost.isRemoved && (!cost.is_completed || cost.isNew),
  ).length,
});
