import { defineConfig } from "vitest/config";
// testTimeout: the generator tests build thousands of sets against the full datasets
export default defineConfig({ resolve: { alias: { "@": import.meta.dirname } }, test: { include: ["tests/**/*.test.ts"], testTimeout: 30000 } });
