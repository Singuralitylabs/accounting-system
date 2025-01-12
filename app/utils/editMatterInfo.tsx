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
      `案件名、分類、チーム、案件開始日のいずれかが空欄のため、案件の更新を中止しました。`
    );
    return false;
  }

  for (const business of businessInfoList) {
    if (business.isRemoved) continue;
    if (
      !business.name ||
      business.amount === null ||
      !business.invoice_date ||
      !business.period_date
    ) {
      alert(`取引先情報に空欄があるため、案件の更新を中止しました。`);
      return false;
    }
    const invoice_date = new Date(business.invoice_date);
    const period_date = new Date(business.period_date);
    if (invoice_date.getTime() > period_date.getTime()) {
      alert(
        `取引先情報の請求日が振込期限より後になっています。\n案件の更新を中止しました。`
      );
      return false;
    }
  }
  for (const cost of costInfoList) {
    if (cost.isRemoved) continue;
    if (
      !cost.name ||
      !cost.item ||
      !cost.payment_target ||
      cost.price === null ||
      !cost.period ||
      !cost.certificate
    ) {
      alert(`コスト情報に空欄があるため、案件の更新を中止しました。`);
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

  for (const costInfo of costInfoList) {
    if (costInfo.isNew && !costInfo.isRemoved) {
      await insertCostInfo(
        costInfo.name,
        costInfo.item,
        costInfo.payment_target,
        costInfo.price,
        costInfo.period ?? "",
        costInfo.certificate,
        costInfo.withholding,
        costInfo.matter_id,
        costInfo.comment ?? ""
      );
    } else if (costInfo.isRemoved && !costInfo.isNew) {
      await deleteCostInfo(costInfo.id);
    } else if (!costInfo.isNew && !costInfo.isRemoved) {
      await updateCostInfo(
        costInfo.id,
        costInfo.name,
        costInfo.item,
        costInfo.payment_target,
        costInfo.price,
        costInfo.period ?? "",
        costInfo.certificate,
        costInfo.withholding,
        costInfo.matter_id,
        costInfo.comment ?? "",
        costInfo.is_completed
      );
    }
  }

  for (const businessInfo of businessInfoList) {
    if (businessInfo.isNew && !businessInfo.isRemoved) {
      await insertBusinessInfo(
        businessInfo.name,
        businessInfo.amount!,
        businessInfo.invoice_date!,
        businessInfo.period_date!,
        matterInfo.id
      );
    } else if (businessInfo.isRemoved && !businessInfo.isNew) {
      await deleteBusinessInfo(businessInfo.id);
    } else if (!businessInfo.isNew && !businessInfo.isRemoved) {
      await updateBusinessInfo(
        businessInfo.id,
        businessInfo.name,
        businessInfo.amount!,
        businessInfo.invoice_date!,
        businessInfo.period_date!,
        matterInfo.id,
        businessInfo.is_completed
      );
    }
  }
  return true;
};

const editMatterInfo = async (
  matterInfo: MatterType,
  businessInfoList: BusinessInCardType[],
  costInfoList: CostInCardType[]
) => {
  const checkUpdate = matterInfo.is_fixed
    ? window.confirm(
        `案件[${matterInfo.title}]を経理申請しますか？\n申請後に更新が必要となった場合、経理まで連絡が必要です。`
      )
    : window.confirm(`案件[${matterInfo.title}]を更新しますか？`);
  if (!checkUpdate) {
    return false;
  }

  const updatedMatterInfo: MatterType = {
    ...matterInfo,
    title: matterInfo.title,
    category: matterInfo.category,
    team: matterInfo.team,
    start_date: matterInfo.start_date,
    description: matterInfo.description,
    is_fixed: matterInfo.is_fixed,
  };

  try {
    const ret = await updateMatter(matterInfo, businessInfoList, costInfoList);
    if (ret) {
      Object.assign(matterInfo, updatedMatterInfo);
      if (matterInfo.is_fixed) {
        alert(`案件[${matterInfo.title}]を経理申請しました。`);
      } else {
        alert(`案件[${matterInfo.title}]を更新しました。`);
      }
      return true;
    }
  } catch (err) {
    if (matterInfo.is_fixed) {
      alert(`案件[${matterInfo.title}]の経理申請に失敗しました。`);
      console.error(`案件[${matterInfo.title}]の経理申請に失敗しました。`, err);
    } else {
      alert(`案件[${matterInfo.title}]の更新に失敗しました。`);
      console.error(`案件[${matterInfo.title}]の更新に失敗しました。`, err);
    }
  }
};

export default editMatterInfo;
