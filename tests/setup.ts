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
      // Mantine が渡す reduced-motion のクエリだけ一致させる（完全一致。否定形などは一致させない）。
      // renderWithMantine の respectReducedMotion と組み合わせて Transition の長さを 0 にする。
      // このスタブは jsdom の全テストに効く（ModalBase のスクロールロック等、respectReducedMotion を
      // 見ずに useReducedMotion を直接読む箇所は、独自の MantineProvider を使うテストでも挙動が変わる）。
      // 理由は docs/testing.md「規約」の renderWithMantine の項を参照
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

  // Mantine Combobox（Select 等）がオプションのフォーカス管理で呼ぶが、jsdom は未実装
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
}
