// 定期費用の支払サイクル定義（recurring_costs.payment_cycle の値域）
const PAYMENT_CYCLE_LABELS: Record<string, string> = {
  monthly: "月払い",
  quarterly: "四半期払い",
  yearly: "年払い",
};

export const PAYMENT_CYCLE_OPTIONS = Object.entries(PAYMENT_CYCLE_LABELS).map(
  ([value, label]) => ({ value, label }),
);

export const formatPaymentCycle = (paymentCycle: string): string =>
  PAYMENT_CYCLE_LABELS[paymentCycle] ?? paymentCycle;
