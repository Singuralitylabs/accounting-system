// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

const { openConfirmModal } = vi.hoisted(() => ({
  openConfirmModal: vi.fn(),
}));

vi.mock("@mantine/modals", () => ({
  modals: {
    openConfirmModal,
  },
}));

import { confirmAction } from "@/app/utils/confirmAction";

describe("confirmAction", () => {
  beforeEach(() => {
    openConfirmModal.mockReset();
  });

  it("確認ボタンで true に解決する", async () => {
    openConfirmModal.mockImplementation(
      (options: { onConfirm: () => void }) => {
        options.onConfirm();
      },
    );

    await expect(confirmAction("実行しますか？")).resolves.toBe(true);
  });

  it("キャンセルボタンで false に解決する", async () => {
    openConfirmModal.mockImplementation((options: { onCancel: () => void }) => {
      options.onCancel();
    });

    await expect(confirmAction("実行しますか？")).resolves.toBe(false);
  });

  it("Esc 相当の onClose で false に解決しハングしない", async () => {
    openConfirmModal.mockImplementation((options: { onClose: () => void }) => {
      options.onClose();
    });

    await expect(confirmAction("実行しますか？")).resolves.toBe(false);
  });

  it("onConfirm のあとに onClose が来ても true のまま", async () => {
    openConfirmModal.mockImplementation(
      (options: { onConfirm: () => void; onClose: () => void }) => {
        options.onConfirm();
        options.onClose();
      },
    );

    await expect(confirmAction("実行しますか？")).resolves.toBe(true);
  });

  it("onClose が渡されている", () => {
    openConfirmModal.mockImplementation(() => undefined);
    void confirmAction("実行しますか？");
    expect(openConfirmModal.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        onClose: expect.any(Function),
        onConfirm: expect.any(Function),
        onCancel: expect.any(Function),
      }),
    );
  });
});
