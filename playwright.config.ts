import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests run against a running app (`bun run dev` or `bun run start`)
 * connected to a real Supabase project (local `supabase start` recommended).
 * Required env: E2E_BASE_URL (default http://localhost:3000).
 * A fake Ollama server is started by the test itself, so no model download is needed.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 120_000,
  fullyParallel: false,
  retries: 0,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
    viewport: { width: 1440, height: 900 },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
