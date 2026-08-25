import {
  BusinessInCardType,
  CostInCardType,
  MatterType,
} from "../../types/types";
import { calcMatterTotalsForEdit } from "../matterCalc";
import {
  getMatterValidationMessage,
  validateMatterPayload,
} from "../matterValidation";
import { bulkUpsertBusinessInfo } from "./businesses";
import { bulkUpsertCostInfo } from "./costs";
import { updateMatterInfo } from "./matters";

export const updateMatter = async (
  matterInfo: MatterType,
  businessInfoList: BusinessInCardType[],
  costInfoList: CostInCardType[]
) => {
  const totals = calcMatterTotalsForEdit(businessInfoList, costInfoList);
  matterInfo.total_amount = totals.total_amount;
  matterInfo.business_count = totals.business_count;
  matterInfo.total_cost = totals.total_cost;
  matterInfo.cost_count = totals.cost_count;
  matterInfo.unchecked_cost_count = totals.unchecked_cost_count;

  // まず matter 情報を更新
  await updateMatterInfo(matterInfo);

  // コストとビジネス情報をバルク操作で並列実行
  await Promise.all([
    bulkUpsertCostInfo(costInfoList, matterInfo.id),
    bulkUpsertBusinessInfo(businessInfoList, matterInfo.id)
  ]);
  return true;
};

// 現行の更新 UI は useMatterData → updateMatter を直接呼ぶため、この default
// はどこからも import されない（バリデーションも実行されない）。配線は Phase 6 以降。
const editMatterInfo = async (
  matterInfo: MatterType,
  businessInfoList: BusinessInCardType[],
  costInfoList: CostInCardType[],
  originalIsFixed?: boolean
) => {
  const isNewApplication = !originalIsFixed && matterInfo.is_fixed;
  const isPostSubmissionUpdate = originalIsFixed && matterInfo.is_fixed;

  let confirmMessage = `案件[${matterInfo.title}]を更新しますか？`;

  if (isNewApplication) {
    confirmMessage = `案件[${matterInfo.title}]を経理申請しますか？\n申請後に更新が必要となった場合、経理まで連絡が必要です。`;
  } else if (isPostSubmissionUpdate) {
    confirmMessage = `案件[${matterInfo.title}]を更新しますか？更新内容は経理に通知されます。`;
    matterInfo.has_updates = true;
  }

  const checkUpdate = window.confirm(confirmMessage);
  if (!checkUpdate) {
    return false;
  }

  const validation = validateMatterPayload(
    matterInfo,
    businessInfoList,
    costInfoList,
    { skipRemoved: true }
  );
  if (!validation.ok) {
    throw new Error(getMatterValidationMessage(validation.reason, "update"));
  }

  try {
    return await updateMatter(matterInfo, businessInfoList, costInfoList);
  } catch (err) {
    const message = matterInfo.is_fixed
      ? `案件[${matterInfo.title}]の経理申請に失敗しました。`
      : `案件[${matterInfo.title}]の更新に失敗しました。`;
    console.error(message, err);
    throw new Error(message);
  }
};

export default editMatterInfo;
