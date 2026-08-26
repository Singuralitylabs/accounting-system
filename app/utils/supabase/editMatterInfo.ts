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

  // updateMatterInfo は throw せず { error } を返す。戻り値を捨てると
  // 案件行の保存失敗が成功扱いになり、後続のコスト・取引先だけ更新される。
  const { error } = await updateMatterInfo(matterInfo);
  if (error) {
    console.error(UPDATE_FAILED_MESSAGE, error);
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
