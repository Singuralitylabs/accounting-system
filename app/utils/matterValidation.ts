import type { BusinessType, CostType, MatterType } from "../types/types";

// Empty matter for the create modal's initial state and payload. The dummy fields
// (id, is_completed, has_updates, user_id, timestamps, parent_matter_id) are overwritten server-side.
export const createEmptyMatter = (): MatterType => ({
  id: 0,
  title: "",
  category: "",
  team: "",
  start_date: null,
  description: "",
  is_fixed: false,
  is_completed: false,
  has_updates: false,
  user_id: 1,
  accounting_memo: null,
  total_amount: null,
  total_cost: null,
  cost_count: null,
  business_count: null,
  unchecked_cost_count: 0,
  parent_matter_id: null,
  inserted_at: "",
  updated_at: "",
});

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
  // The form can leave this null.
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

export const hasMatterRequiredFields = (
  matterInfo: MatterRequiredFields,
  options?: { requireStartDate?: boolean },
) => {
  const requireStartDate = options?.requireStartDate !== false;
  return !!(
    matterInfo.title &&
    matterInfo.category &&
    matterInfo.team &&
    (!requireStartDate || matterInfo.start_date)
  );
};

export const normalizeMatterStartDate = (
  start_date: MatterRequiredFields["start_date"],
): MatterRequiredFields["start_date"] => start_date || null;

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
 * Required checks and invoice/payment-due ordering shared by create and update.
 * `skipRemoved: true` ignores `isRemoved` rows. `requireStartDate: false` lets existing drafts with a
 * nullable start date be updated by editing other fields (required on create and on accounting
 * request, i.e. `is_fixed === true`).
 */
export const validateMatterPayload = (
  matterInfo: MatterRequiredFields,
  businessList: BusinessValidationFields[],
  costList: CostValidationFields[],
  options?: { skipRemoved?: boolean; requireStartDate?: boolean },
): MatterValidationResult => {
  if (
    !hasMatterRequiredFields(matterInfo, {
      requireStartDate: options?.requireStartDate,
    })
  ) {
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
