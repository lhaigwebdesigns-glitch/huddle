import { defineConfig } from "vitest/config";
// Unit tests run in plain Node (no Cloudflare plugin needed).
export default defineConfig({ test: { include: ["src/**/*.test.ts"] } });
