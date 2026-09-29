import { MantineProvider } from "@mantine/core";
import { render, type RenderOptions } from "@testing-library/react";
import type { ReactElement } from "react";
import { DatesLocaleProvider } from "@/app/components/providers/DatesLocaleProvider";
import { theme } from "@/app/theme";

// Zero Mantine Transition durations (Menu / Popover / Modal etc.), together with the matchMedia stub in
// setup.ts. Scope and rationale: docs/testing.md (renderWithMantine in the conventions section).
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
