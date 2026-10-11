import { defineConfig } from "tsup";
export default defineConfig({
  entry: ["src/server.ts", "prisma/seed.ts", "prisma/seed-demo.ts"],
  format: ["esm"],
  target: "node20",
  platform: "node",
  sourcemap: true,
  clean: true,
  splitting: false,
  noExternal: ["@inventario/shared"],
  external: ["@prisma/client", "argon2", "sharp"],
  outDir: "dist",
});
