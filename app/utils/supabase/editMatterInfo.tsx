import {
  BusinessInCardType,
  CostInCardType,
  MatterType,
} from "../../types/types";
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
  matterInfo.total_amount = businessInfoList.reduce((acc, business) => {
    return business.amount && !business.isRemoved ? acc + business.amount : acc;
  }, 0);

  matterInfo.business_count = businessInfoList.filter(
    (business) => !business.isRemoved
  ).length;

  matterInfo.total_cost = costInfoList.reduce((acc, cost) => {
    return cost.price && !cost.isRemoved ? acc + cost.price : acc;
  }, 0);

  matterInfo.cost_count = costInfoList.filter((cost) => !cost.isRemoved).length;

  matterInfo.unchecked_cost_count = costInfoList.filter(
    (cost) => !cost.isRemoved && (!cost.is_completed || cost.isNew)
  ).length;

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
