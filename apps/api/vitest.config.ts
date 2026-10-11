import { defineConfig } from "vitest/config";
import path from "node:path";
export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 60000,
    setupFiles: ["./test/setup.ts"],
    include: ["test/**/*.test.ts"],
  },
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
});
