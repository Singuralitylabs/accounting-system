import {
  BusinessInCardType,
  CostInCardType,
  MatterType,
} from "../../types/types";
import { calcMatterTotalsForEdit } from "../matterCalc";
import { validateMatterPayload } from "../matterValidation";
import {
  bulkUpsertBusinessInfo,
  bulkUpsertCostInfo,
  updateMatterInfo,
} from "./supabaseServer";

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
    if (validation.reason === "matter_required") {
      alert(
        `案件名、分類、チーム、案件開始日のいずれかが空欄のため、案件の更新を中止しました。`
      );
    } else if (validation.reason === "business_required") {
      alert(`取引先情報に空欄があるため、案件の更新を中止しました。`);
    } else if (validation.reason === "business_date_order") {
      alert(
        `取引先情報の請求日が振込期限より後になっています。\n案件の更新を中止しました。`
      );
    } else if (validation.reason === "cost_required") {
      alert(`コスト情報に空欄があるため、案件の更新を中止しました。`);
    }
    return false;
  }

  try {
    const ret = await updateMatter(matterInfo, businessInfoList, costInfoList);
    if (ret) {
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
