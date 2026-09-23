import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(process.cwd()) } },
  test: { include: ["**/*.test.ts"], exclude: ["node_modules/**", ".next/**"] },
});
