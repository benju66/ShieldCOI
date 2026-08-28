import { defineConfig } from "vitest/config";

// Standalone config for unit tests. complianceEngine is a pure module, so we run
// in the Node environment and skip the app's React/Tailwind Vite plugins.
export default defineConfig({
  test: {
    environment: "node",
    // api/ is included so the extraction helpers — which decide whether a
    // certificate goes to manual review — are covered too.
    include: ["src/**/*.test.ts", "api/**/*.test.ts"],
  },
});
