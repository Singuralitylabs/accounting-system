// Maps a save result to a toast. save_profit_loss_adjustment deletes the adjustment when delta is 0
// (deleted=true), but returns deleted=false with adjustment_amount=0 when there was nothing to
// delete (e.g. already deleted in another tab). Treating !deleted as "saved" would misreport that
// no-op, hence three outcomes.

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
  unchanged:
    "変更はありませんでした（実績額修正が既に削除されているか、元データが更新されています）。画面を再読み込みしてください。",
};
