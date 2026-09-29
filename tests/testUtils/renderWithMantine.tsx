import { MantineProvider } from "@mantine/core";
import { render, type RenderOptions } from "@testing-library/react";
import type { ReactElement } from "react";
import { DatesLocaleProvider } from "@/app/components/providers/DatesLocaleProvider";
import { theme } from "@/app/theme";

// Mantine の Transition（Menu / Popover / Modal 等）の長さを 0 にする（setup.ts の matchMedia
// スタブと組み合わせる）。対象範囲と理由は docs/testing.md「規約」の renderWithMantine の項を参照
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
