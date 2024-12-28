import { BusinessType, CostType, MatterType } from "../types/types";
import {
  insertBusinessInfo,
  insertCostInfo,
  insertMatterInfo,
} from "./supabaseServer";

const insertMatter = async (
  matterInfo: MatterType,
  businessList: BusinessType[],
  costList: CostType[]
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

  for (const business of businessList) {
    if (
      !business.name ||
      business.amount === null ||
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
  for (const cost of costList) {
    if (
      !cost.name ||
      !cost.item ||
      !cost.payment_target ||
      cost.price === null ||
      !cost.period ||
      !cost.certificate
    ) {
      alert(`コスト情報に空欄があるため、案件の作成を中止しました。`);
      return false;
    }
  }

  const totalAmount = businessList.reduce((acc, business) => {
    return business.amount ? acc + business.amount : acc;
  }, 0);
  const totalCost = costList.reduce((acc, cost) => {
    return cost.price ? acc + cost.price : acc;
  }, 0);

  const { newId, error: matterError } = await insertMatterInfo(
    matterInfo.title,
    matterInfo.category,
    matterInfo.team,
    matterInfo.start_date!,
    matterInfo.is_fixed!,
    totalAmount,
    businessList.length,
    totalCost,
    costList.length,
    costList.length,
    matterInfo.description
  );
  if (matterError) throw new Error(matterError.message);
  if (!newId) throw new Error("案件IDの取得に失敗しました。");

  for (const cost of costList) {
    const { error: costError } = await insertCostInfo(
      cost.name,
      cost.item,
      cost.payment_target,
      cost.price,
      cost.period!,
      cost.certificate,
      cost.withholding,
      newId,
      cost.comment!
    );
    if (costError) throw new Error(costError.message);
  }

  for (const business of businessList) {
    const { error: businessError } = await insertBusinessInfo(
      business.name,
      business.amount!,
      business.invoice_date!,
      business.period_date!,
      newId
    );
    if (businessError) throw new Error(businessError.message);
  }

  return true;
};

export default insertMatter;
