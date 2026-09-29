import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  test: {
    // Node environment by default (pure-function tests); component tests opt in to jsdom via `// @vitest-environment jsdom`.
    environment: "node",
    // Dates assume JST; pin the timezone so results do not change on UTC CI.
    env: {
      TZ: "Asia/Tokyo",
    },
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    setupFiles: ["./tests/setup.ts"],
  },
});
