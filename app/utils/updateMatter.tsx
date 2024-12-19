import { BusinessInCardType, CostInCardType, MatterType } from "../types/types";
import {
  deleteBusinessInfo,
  deleteCostInfo,
  insertBusinessInfo,
  insertCostInfo,
  updateBusinessInfo,
  updateCostInfo,
  updateMatterInfo,
} from "./supabaseServer";

export const updateMatter = async (
  matterInfo: MatterType,
  businessInfoList: BusinessInCardType[],
  costInfoList: CostInCardType[]
) => {
  if (
    !matterInfo.title ||
    !matterInfo.category ||
    !matterInfo.team ||
    !matterInfo.start_date
  ) {
    alert(
      `案件名、分類、チーム、案件開始日のいずれかが空欄のため、案件の作成を中止しました。`
    );
    return false;
  }

  for (const business of businessInfoList) {
    if (
      !business.name ||
      !business.amount ||
      !business.invoice_date ||
      !business.period_date
    ) {
      alert(`取引先情報に空欄があるため、案件の作成を中止しました。`);
      return false;
    }
    const invoice_date = new Date(business.invoice_date);
    const period_date = new Date(business.period_date);
    if (invoice_date.getTime() > period_date.getTime()) {
      alert(
        `取引先情報の請求日が振込期限より後になっています。\n案件の作成を中止しました。`
      );
      return false;
    }
  }
  for (const cost of costInfoList) {
    if (
      !cost.name ||
      !cost.item ||
      !cost.payment_target ||
      !cost.price ||
      !cost.period ||
      !cost.certificate
    ) {
      alert(`コスト情報に空欄があるため、案件の作成を中止しました。`);
      return false;
    }
  }

  const totalAmount = businessInfoList.reduce((acc, business) => {
    return business.amount && !business.isRemoved ? acc + business.amount : acc;
  }, 0);
  const totalCost = costInfoList.reduce((acc, cost) => {
    return cost.price && !cost.isRemoved ? acc + cost.price : acc;
  }, 0);

  matterInfo.total_amount = totalAmount;
  matterInfo.business_count = businessInfoList.filter(
    (business) => !business.isRemoved
  ).length;
  matterInfo.total_cost = totalCost;
  matterInfo.cost_count = costInfoList.filter((cost) => !cost.isRemoved).length;
  matterInfo.unchecked_cost_count = costInfoList.filter(
    (cost) => !cost.is_completed
  ).length;

  await updateMatterInfo(matterInfo);

  for (const costInfoInCard of costInfoList) {
    if (costInfoInCard.isNew && !costInfoInCard.isRemoved) {
      await insertCostInfo(
        costInfoInCard.name,
        costInfoInCard.item,
        costInfoInCard.payment_target,
        costInfoInCard.price,
        costInfoInCard.period ?? "",
        costInfoInCard.certificate,
        costInfoInCard.withholding,
        costInfoInCard.matter_id,
        costInfoInCard.comment ?? ""
      );
    } else if (costInfoInCard.isRemoved && !costInfoInCard.isNew) {
      await deleteCostInfo(costInfoInCard.id);
    } else if (!costInfoInCard.isNew && !costInfoInCard.isRemoved) {
      await updateCostInfo(
        costInfoInCard.id,
        costInfoInCard.name,
        costInfoInCard.item,
        costInfoInCard.payment_target,
        costInfoInCard.price,
        costInfoInCard.period ?? "",
        costInfoInCard.certificate,
        costInfoInCard.withholding,
        costInfoInCard.matter_id,
        costInfoInCard.comment ?? "",
        costInfoInCard.is_completed
      );
    }
  }

  for (const businessInfoInCard of businessInfoList) {
    if (businessInfoInCard.isNew && !businessInfoInCard.isRemoved) {
      await insertBusinessInfo(
        businessInfoInCard.name,
        businessInfoInCard.amount!,
        businessInfoInCard.invoice_date!,
        businessInfoInCard.period_date!,
        matterInfo.id
      );
    } else if (businessInfoInCard.isRemoved && !businessInfoInCard.isNew) {
      await deleteBusinessInfo(businessInfoInCard.id);
    } else if (!businessInfoInCard.isNew && !businessInfoInCard.isRemoved) {
      await updateBusinessInfo(
        businessInfoInCard.id,
        businessInfoInCard.name,
        businessInfoInCard.amount!,
        businessInfoInCard.invoice_date!,
        businessInfoInCard.period_date!,
        matterInfo.id,
        businessInfoInCard.is_completed
      );
    }
  }
  return true;
};

export default updateMatter;
