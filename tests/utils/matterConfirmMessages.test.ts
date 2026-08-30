import { describe, expect, it } from "vitest";
import { getUpdateMatterConfirmMessage } from "@/app/utils/matterConfirmMessages";

describe("getUpdateMatterConfirmMessage", () => {
  it("下書きから申請するときは経理申請の確認文を返す", () => {
    expect(getUpdateMatterConfirmMessage("案件A", false, true)).toBe(
      "案件[案件A]を経理申請しますか？\n申請後に更新が必要となった場合、経理まで連絡が必要です。",
    );
  });

  it("申請済みの更新は経理通知の確認文を返す", () => {
    expect(getUpdateMatterConfirmMessage("案件A", true, true)).toBe(
      "案件[案件A]を更新しますか？更新内容は経理に通知されます。",
    );
  });

  it("下書きの更新は通常の確認文を返す", () => {
    expect(getUpdateMatterConfirmMessage("案件A", false, false)).toBe(
      "案件[案件A]を更新しますか？",
    );
  });
});
