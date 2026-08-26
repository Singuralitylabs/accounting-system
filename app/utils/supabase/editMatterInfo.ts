import {
  BusinessInCardType,
  CostInCardType,
  MatterType,
} from "../../types/types";
import { calcMatterTotalsForEdit } from "../matterCalc";
import { bulkUpsertBusinessInfo } from "./businesses";
import { bulkUpsertCostInfo } from "./costs";
import { updateMatterInfo } from "./matters";

const UPDATE_FAILED_MESSAGE = "案件の更新に失敗しました。";

export const updateMatter = async (
  matterInfo: MatterType,
  businessInfoList: BusinessInCardType[],
  costInfoList: CostInCardType[],
) => {
  const totals = calcMatterTotalsForEdit(businessInfoList, costInfoList);
  matterInfo.total_amount = totals.total_amount;
  matterInfo.business_count = totals.business_count;
  matterInfo.total_cost = totals.total_cost;
  matterInfo.cost_count = totals.cost_count;
  matterInfo.unchecked_cost_count = totals.unchecked_cost_count;
  matterInfo.start_date = matterInfo.start_date || null;

  // updateMatterInfo は throw せず { status, error } を返す。error が無くても
  // RLS / 削除済みでは status が [] になり、案件行は保存されていない。
  const { status, error } = await updateMatterInfo(matterInfo);
  const updatedCount = Array.isArray(status) ? status.length : 0;
  if (error || updatedCount !== 1) {
    console.error(UPDATE_FAILED_MESSAGE, error ?? status);
    throw new Error(UPDATE_FAILED_MESSAGE);
  }

  try {
    await Promise.all([
      bulkUpsertCostInfo(costInfoList, matterInfo.id),
      bulkUpsertBusinessInfo(businessInfoList, matterInfo.id),
    ]);
    return true;
  } catch (error) {
    // costs.ts / businesses.ts は "use server" のため、本番ビルドでは
    // throw した日本語がマスクされる。クライアント側で再ラップして表示を保証する。
    console.error(UPDATE_FAILED_MESSAGE, error);
    throw new Error(UPDATE_FAILED_MESSAGE);
  }
};
