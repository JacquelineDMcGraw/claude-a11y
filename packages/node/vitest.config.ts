import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    testTimeout: 15_000,
    coverage: {
      provider: "v8",
      include: ["src/hooks/**/*.ts"],
      exclude: ["src/hooks/tts/engines/**", "src/hooks/earcon/engines/**"],
      thresholds: {
        lines: 60,
        branches: 50,
      },
    },
  },
});
