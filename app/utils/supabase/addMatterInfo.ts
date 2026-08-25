import { BusinessType, CostType, MatterType } from "@/app/types/types";
import {
  calcMatterTotalsForCreate,
  sumBusinessAmounts,
} from "@/app/utils/matterCalc";
import {
  MATTER_VALIDATION_ALERTS,
  validateMatterPayload,
} from "@/app/utils/matterValidation";
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
  if (matterInfo.is_fixed) {
    const checkCreated = window.confirm(
      `案件[${matterInfo.title}]を経理申請しますか？`
    );
    if (!checkCreated) {
      alert(`案件[${matterInfo.title}]の経理申請を中止しました。`);
      return;
    }
  } else {
    const checkCreated = window.confirm(
      `案件[${matterInfo.title}]の下書きを作成しますか？\n作成した案件は経理申請扱いにはなりませんが、経理に共有はされます。`
    );
    if (!checkCreated) {
      alert(`案件[${matterInfo.title}]の下書き作成を中止しました。`);
      return;
    }
  }

  const validation = validateMatterPayload(
    matterInfo,
    businessList,
    costList
  );
  if (!validation.ok) {
    alert(MATTER_VALIDATION_ALERTS[validation.reason]("作成"));
    return false;
  }

  if (sumBusinessAmounts(businessList) === 0) {
    const checkCreated = window.confirm(
      "取引先情報の報酬額の合計が0円です。このまま作成して良いでしょうか？"
    );
    if (!checkCreated) {
      alert("経理申請を中止しました。");
      return;
    }
  }

  try {
    const ret = await insertMatter(matterInfo, businessList, costList);
    if (ret) {
      if (matterInfo.is_fixed) {
        alert(`${matterInfo.title}の経理申請を完了しました。`);
      } else {
        alert(
          `${matterInfo.title}の下書き作成を完了しました。\n経理申請まで忘れずご対応をお願い致します。`
        );
      }
    }
    return ret;
  } catch (error) {
    if (matterInfo.is_fixed) {
      alert(`${matterInfo.title}の経理申請に失敗しました。`);
    } else {
      alert(`${matterInfo.title}の下書き作成に失敗しました。`);
    }
    console.error(error);
  }
};

export default addMatterInfo;
