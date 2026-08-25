import { BusinessType, CostType, MatterType } from "@/app/types/types";
import {
  calcMatterTotalsForCreate,
} from "@/app/utils/matterCalc";
import {
  getMatterValidationMessage,
  validateMatterPayload,
} from "@/app/utils/matterValidation";
import { insertBusinessInfo } from "./businesses";
import { insertCostInfo } from "./costs";
import { insertMatterInfo } from "./matters";

const insertMatter = async (
  matterInfo: MatterType,
  businessList: BusinessType[],
  costList: CostType[]
) => {
  const totals = calcMatterTotalsForCreate(businessList, costList);
  matterInfo.total_amount = totals.total_amount;
  matterInfo.total_cost = totals.total_cost;

  const { newId, error: matterError } = await insertMatterInfo(
    matterInfo.title,
    matterInfo.category,
    matterInfo.team,
    matterInfo.start_date!,
    matterInfo.is_fixed!,
    matterInfo.total_amount!,
    businessList.length,
    matterInfo.total_cost!,
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

const addMatterInfo = async (
  matterInfo: MatterType,
  businessList: BusinessType[],
  costList: CostType[]
) => {
  const validation = validateMatterPayload(
    matterInfo,
    businessList,
    costList
  );
  if (!validation.ok) {
    throw new Error(getMatterValidationMessage(validation.reason, "create"));
  }

  try {
    return await insertMatter(matterInfo, businessList, costList);
  } catch (error) {
    console.error(error);
    throw new Error(
      matterInfo.is_fixed
        ? `${matterInfo.title}の経理申請に失敗しました。`
        : `${matterInfo.title}の下書き作成に失敗しました。`,
    );
  }
};

export default addMatterInfo;
