import { defineConfig } from "vitest/config";

// Standalone config for unit tests. complianceEngine is a pure module, so we run
// in the Node environment and skip the app's React/Tailwind Vite plugins.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
