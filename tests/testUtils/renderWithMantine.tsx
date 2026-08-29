import { MantineProvider } from "@mantine/core";
import { render, type RenderOptions } from "@testing-library/react";
import type { ReactElement } from "react";
import { DatesLocaleProvider } from "@/app/components/providers/DatesLocaleProvider";
import { theme } from "@/app/theme";

export function renderWithMantine(
  ui: ReactElement,
  options?: Omit<RenderOptions, "wrapper">,
) {
  return render(ui, {
    wrapper: ({ children }) => (
      <MantineProvider theme={theme}>
        <DatesLocaleProvider>{children}</DatesLocaleProvider>
      </MantineProvider>
    ),
    ...options,
  });
}
