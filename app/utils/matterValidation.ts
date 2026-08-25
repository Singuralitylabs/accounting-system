import type { BusinessType, CostType, MatterType } from "../types/types";

export type MatterRequiredFields = Pick<
  MatterType,
  "title" | "category" | "team" | "start_date"
>;

export type BusinessValidationFields = Pick<
  BusinessType,
  "name" | "amount" | "invoice_date" | "period_date"
> & { isRemoved?: boolean };

export type CostValidationFields = Pick<
  CostType,
  "name" | "item" | "payment_target" | "period" | "certificate"
> & {
  // フォーム上は未入力を null とし得る（既存の必須チェック）
  price: CostType["price"] | null;
  isRemoved?: boolean;
};

export type MatterValidationReason =
  | "matter_required"
  | "business_required"
  | "business_date_order"
  | "cost_required";

export type MatterValidationResult =
  | { ok: true }
  | { ok: false; reason: MatterValidationReason };

export const MATTER_VALIDATION_ALERTS: Record<
  MatterValidationReason,
  (action: "作成" | "更新") => string
> = {
  matter_required: (action) =>
    `案件名、分類、チーム、案件開始日のいずれかが空欄のため、案件の${action}を中止しました。`,
  business_required: (action) =>
    `取引先情報に空欄があるため、案件の${action}を中止しました。`,
  business_date_order: (action) =>
    `取引先情報の請求日が振込期限より後になっています。\n案件の${action}を中止しました。`,
  cost_required: (action) =>
    `コスト情報に空欄があるため、案件の${action}を中止しました。`,
};

export const hasMatterRequiredFields = (matterInfo: MatterRequiredFields) =>
  !!(
    matterInfo.title &&
    matterInfo.category &&
    matterInfo.team &&
    matterInfo.start_date
  );

export const validateBusinessEntry = (
  business: BusinessValidationFields,
): "ok" | "required" | "date_order" => {
  if (
    !business.name ||
    business.amount === null ||
    !business.invoice_date ||
    !business.period_date
  ) {
    return "required";
  }
  const invoice_date = new Date(business.invoice_date);
  const period_date = new Date(business.period_date);
  if (invoice_date.getTime() > period_date.getTime()) {
    return "date_order";
  }
  return "ok";
};

export const hasCostRequiredFields = (cost: CostValidationFields) =>
  !!(
    cost.name &&
    cost.item &&
    cost.payment_target &&
    cost.price !== null &&
    cost.period &&
    cost.certificate
  );

/**
 * 案件作成・更新で共通の必須チェックと請求日/振込期限の前後チェック。
 * `skipRemoved: true` のとき `isRemoved` 行は見ない（更新時の既存挙動）。
 */
export const validateMatterPayload = (
  matterInfo: MatterRequiredFields,
  businessList: BusinessValidationFields[],
  costList: CostValidationFields[],
  options?: { skipRemoved?: boolean },
): MatterValidationResult => {
  if (!hasMatterRequiredFields(matterInfo)) {
    return { ok: false, reason: "matter_required" };
  }

  for (const business of businessList) {
    if (options?.skipRemoved && business.isRemoved) continue;
    const businessResult = validateBusinessEntry(business);
    if (businessResult === "required") {
      return { ok: false, reason: "business_required" };
    }
    if (businessResult === "date_order") {
      return { ok: false, reason: "business_date_order" };
    }
  }

  for (const cost of costList) {
    if (options?.skipRemoved && cost.isRemoved) continue;
    if (!hasCostRequiredFields(cost)) {
      return { ok: false, reason: "cost_required" };
    }
  }

  return { ok: true };
};

export const getMatterValidationMessage = (
  reason: MatterValidationReason,
  action: "create" | "update",
) => MATTER_VALIDATION_ALERTS[reason](action === "create" ? "作成" : "更新");
