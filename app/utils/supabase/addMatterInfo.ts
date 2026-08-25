import { BusinessType, CostType, MatterType } from "@/app/types/types";
import { calcMatterTotalsForCreate } from "@/app/utils/matterCalc";
import { validateMatterPayload } from "@/app/utils/matterValidation";
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
    if (validation.reason === "matter_required") {
      alert(
        `案件名、分類、チーム、案件開始日のいずれかが空欄のため、案件の作成を中止しました。`
      );
    } else if (validation.reason === "business_required") {
      alert(`取引先情報に空欄があるため、案件の作成を中止しました。`);
    } else if (validation.reason === "business_date_order") {
      alert(
        `取引先情報の請求日が振込期限より後になっています。\n案件の作成を中止しました。`
      );
    } else if (validation.reason === "cost_required") {
      alert(`コスト情報に空欄があるため、案件の作成を中止しました。`);
    }
    return false;
  }

  const totalCompensation = businessList.reduce(
    (sum, business) => sum + (business.amount || 0),
    0
  );
  if (totalCompensation === 0) {
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
