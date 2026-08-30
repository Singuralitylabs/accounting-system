import { BusinessType, CostType, MatterType } from "@/app/types/types";
import {
  calcMatterTotalsForCreate,
} from "@/app/utils/matterCalc";
import {
  getMatterValidationMessage,
  validateMatterPayload,
} from "@/app/utils/matterValidation";
import { bulkInsertBusinessInfo } from "./businesses";
import { bulkInsertCostInfo } from "./costs";
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

  const [{ error: costError }, { error: businessError }] = await Promise.all([
    bulkInsertCostInfo(
      costList.map((cost) => ({
        name: cost.name,
        item: cost.item,
        payment_target: cost.payment_target,
        price: cost.price,
        period: cost.period!,
        certificate: cost.certificate,
        withholding: cost.withholding,
        comment: cost.comment,
      })),
      newId
    ),
    bulkInsertBusinessInfo(
      businessList.map((business) => ({
        name: business.name,
        amount: business.amount!,
        invoice_date: business.invoice_date!,
        period_date: business.period_date!,
      })),
      newId
    ),
  ]);
  if (costError) throw new Error(costError.message);
  if (businessError) throw new Error(businessError.message);

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
