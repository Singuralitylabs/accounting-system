import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // tsconfig.json の paths（"@/*": ["./*"]）に合わせる
      "@": path.resolve(__dirname, "."),
    },
  },
  test: {
    // ビジネスロジック（純粋関数）のテストが対象のため node 環境をデフォルトとする。
    // コンポーネントテストはファイル先頭の `// @vitest-environment jsdom` で切り替える。
    environment: "node",
    // 日付処理が JST 前提のため、CI（UTC）でも結果が変わらないようタイムゾーンを固定する
    env: {
      TZ: "Asia/Tokyo",
    },
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    setupFiles: ["./tests/setup.ts"],
  },
});
