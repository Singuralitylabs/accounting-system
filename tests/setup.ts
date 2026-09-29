import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

afterEach(() => {
  if (typeof document !== "undefined") {
    cleanup();
  }
});

// Browser API stubs needed only in the jsdom environment; no-op in the default node environment (no window).
if (typeof window !== "undefined") {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      // Match only Mantine's reduced-motion query (exact match). Combined with renderWithMantine's
      // respectReducedMotion this zeroes Transition durations. The stub affects every jsdom test: code that
      // reads useReducedMotion directly (e.g. ModalBase scroll lock) also changes behavior under a custom
      // MantineProvider. Rationale: docs/testing.md (renderWithMantine in the conventions section).
      matches: query === "(prefers-reduced-motion: reduce)",
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });

  class ResizeObserverMock {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  window.ResizeObserver = ResizeObserverMock;

  window.scrollTo = vi.fn();

  // Called by Mantine Combobox for option focus management; not implemented in jsdom.
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
}
