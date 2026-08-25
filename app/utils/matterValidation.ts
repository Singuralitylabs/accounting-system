export type MatterRequiredFields = {
  title?: string | null;
  category?: string | null;
  team?: string | null;
  start_date?: string | Date | null;
};

export type BusinessValidationFields = {
  name?: string | null;
  amount?: number | null;
  invoice_date?: string | Date | null;
  period_date?: string | Date | null;
  isRemoved?: boolean;
};

export type CostValidationFields = {
  name?: string | null;
  item?: string | null;
  payment_target?: string | null;
  price?: number | null;
  period?: string | Date | null;
  certificate?: string | null;
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
