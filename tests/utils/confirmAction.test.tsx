// @vitest-environment jsdom

import { MantineProvider } from "@mantine/core";
import { ModalsProvider } from "@mantine/modals";
import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { confirmAction } from "@/app/utils/confirmAction";

function renderModalsHost() {
  return render(
    <MantineProvider>
      <ModalsProvider modalProps={{ transitionProps: { duration: 0 } }}>
        <div>host</div>
      </ModalsProvider>
    </MantineProvider>,
  );
}

async function flushUi() {
  await new Promise((resolve) => setTimeout(resolve, 50));
}

async function openConfirm(message = "実行しますか？") {
  const pending = confirmAction(message);
  await flushUi();
  expect(document.body.textContent).toContain(message);
  return { pending };
}

function buttonByLabel(label: string) {
  return Array.from(document.querySelectorAll("button")).find((button) =>
    button.textContent?.includes(label),
  );
}

describe("confirmAction", () => {
  it("確認ボタンで true に解決する（続けて onClose が来ても true を維持）", async () => {
    renderModalsHost();
    const { pending } = await openConfirm();

    fireEvent.click(buttonByLabel("OK")!);
    await flushUi();

    await expect(pending).resolves.toBe(true);
  });

  it("キャンセルボタンで false に解決する", async () => {
    renderModalsHost();
    const { pending } = await openConfirm();

    fireEvent.click(buttonByLabel("キャンセル")!);
    await flushUi();

    await expect(pending).resolves.toBe(false);
  });

  it("Esc で閉じても Promise が false に解決しハングしない", async () => {
    renderModalsHost();
    const { pending } = await openConfirm();

    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    fireEvent.keyDown(dialog!, { key: "Escape", bubbles: true });
    await flushUi();

    await expect(pending).resolves.toBe(false);
  });

  it("閉じるボタンで Promise が false に解決する", async () => {
    renderModalsHost();
    const { pending } = await openConfirm();

    const closeButton = document.querySelector(".mantine-Modal-close");
    expect(closeButton).not.toBeNull();
    fireEvent.click(closeButton!);
    await flushUi();

    await expect(pending).resolves.toBe(false);
  });

  it("オーバーレイクリックで Promise が false に解決する", async () => {
    renderModalsHost();
    const { pending } = await openConfirm();

    const overlay = document.querySelector(".mantine-Modal-overlay");
    expect(overlay).not.toBeNull();
    fireEvent.click(overlay!);
    await flushUi();

    await expect(pending).resolves.toBe(false);
  });
});
