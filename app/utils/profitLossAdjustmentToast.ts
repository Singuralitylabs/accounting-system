// 実績額修正の保存結果の表示振り分け（純粋関数）。
// DB 関数 save_profit_loss_adjustment は差分 0（実績額 = 元データ）の場合、
// 既存の調整を削除して deleted=true を返すが、削除対象が無い場合（Issue #139）は
// deleted=false・adjustment_amount=0 を返す。呼び出し側は !deleted を一律
// 「保存しました」にすると、競合時（別タブで先に削除済み）に何も起きていないのに
// 保存成功に見えてしまうため、3 値で振り分ける。

export type SaveAdjustmentOutcome = "deleted" | "saved" | "unchanged";

export const resolveSaveAdjustmentOutcome = (
  deleted: boolean,
  adjustmentAmount: number,
): SaveAdjustmentOutcome => {
  if (deleted) return "deleted";
  if (adjustmentAmount === 0) return "unchanged";
  return "saved";
};

export const SAVE_ADJUSTMENT_TOAST: Record<SaveAdjustmentOutcome, string> = {
  deleted: "実績額修正を削除しました。",
  saved: "実績額を保存しました。",
  unchanged: "実績額修正は既に削除されています。画面を再読み込みしてください。",
};
