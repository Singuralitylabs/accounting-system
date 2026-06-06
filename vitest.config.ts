import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      // tsconfig.json の paths（"@/*": ["./*"]）に合わせる
      "@": path.resolve(__dirname, "."),
    },
  },
  test: {
    // ビジネスロジック（純粋関数）のテストが対象のため node 環境をデフォルトとする
    environment: "node",
    // 日付処理が JST 前提のため、CI（UTC）でも結果が変わらないようタイムゾーンを固定する
    env: {
      TZ: "Asia/Tokyo",
    },
    include: ["tests/**/*.test.ts"],
  },
});
