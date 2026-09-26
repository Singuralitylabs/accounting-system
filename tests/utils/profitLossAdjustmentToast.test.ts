import { describe, expect, it } from "vitest";
import {
  SAVE_ADJUSTMENT_TOAST,
  resolveSaveAdjustmentOutcome,
} from "@/app/utils/profitLossAdjustmentToast";

describe("resolveSaveAdjustmentOutcome（Issue #139）", () => {
  it("削除された場合は deleted", () => {
    expect(resolveSaveAdjustmentOutcome(true, 0)).toBe("deleted");
    expect(SAVE_ADJUSTMENT_TOAST[resolveSaveAdjustmentOutcome(true, 0)]).toBe(
      "実績額修正を削除しました。",
    );
  });

  it("差分がある保存は saved", () => {
    expect(resolveSaveAdjustmentOutcome(false, 20000)).toBe("saved");
    expect(resolveSaveAdjustmentOutcome(false, -5000)).toBe("saved");
    expect(
      SAVE_ADJUSTMENT_TOAST[resolveSaveAdjustmentOutcome(false, 20000)],
    ).toBe("実績額を保存しました。");
  });

  it("差分 0 で削除対象が無い場合（別タブで先に削除済み等）は unchanged", () => {
    // 以前は !deleted を一律「保存しました」にしており、競合時に誤トーストになった
    expect(resolveSaveAdjustmentOutcome(false, 0)).toBe("unchanged");
    expect(
      SAVE_ADJUSTMENT_TOAST[resolveSaveAdjustmentOutcome(false, 0)],
    ).toContain("既に削除されています");
  });
});
