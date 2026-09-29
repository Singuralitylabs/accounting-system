import { MantineProvider } from "@mantine/core";
import { render, type RenderOptions } from "@testing-library/react";
import type { ReactElement } from "react";
import { DatesLocaleProvider } from "@/app/components/providers/DatesLocaleProvider";
import { theme } from "@/app/theme";

// テストでは Mantine のトランジション（Menu / Popover / Modal / Collapse 等）を無効にする。
// respectReducedMotion を有効にし、setup.ts の matchMedia スタブで prefers-reduced-motion を
// 一致させると、トランジションの長さが 0 になり rAF・タイマーを使わず同期で開閉する。
// Mantine 7 の useTransition は開いている途中（2 段目の rAF 待ち）に閉じると、先に予約した rAF を
// 取り消さないため、アンマウントしても消えない 150ms のタイマーが残る。テストファイルの後始末
// （jsdom の破棄）の後にそれが発火すると `window is not defined` の未処理エラーになり、全テストが
// 成功していても vitest が失敗扱いになる（タイミング次第で断続的に起きる）
const testTheme = { ...theme, respectReducedMotion: true };

export function renderWithMantine(
  ui: ReactElement,
  options?: Omit<RenderOptions, "wrapper">,
) {
  return render(ui, {
    wrapper: ({ children }) => (
      <MantineProvider theme={testTheme}>
        <DatesLocaleProvider>{children}</DatesLocaleProvider>
      </MantineProvider>
    ),
    ...options,
  });
}
