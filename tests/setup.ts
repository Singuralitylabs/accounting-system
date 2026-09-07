import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

afterEach(() => {
  if (typeof document !== "undefined") {
    cleanup();
  }
});

// jsdom 環境（コンポーネントテスト）でのみ必要なブラウザ API スタブ。
// デフォルトの node 環境では window が無いので何もしない。
if (typeof window !== "undefined") {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
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

  // Mantine Combobox（Select 等）がオプションのフォーカス管理で呼ぶが、jsdom は未実装
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
}
