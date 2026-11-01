import { expect, test } from "@playwright/test";
import type { Server } from "node:http";
import { startFakeOllama } from "./fake-ollama";

/**
 * PRD §20/§24 end-to-end journey:
 * signed in → create project → generate (Ollama) → modify with AI → save → reload →
 * generate scenes → present → switch format → export → sign out.
 *
 * Sign-in is Google OAuth, which can't be scripted. Record a signed-in session once:
 *   bunx playwright codegen http://localhost:3000/login --save-storage=tests/e2e/.auth/user.json
 * (sign in with a test Google account, then close the window), and run with
 *   E2E_STORAGE_STATE=tests/e2e/.auth/user.json bun run test:e2e
 */
let ollama: Server;
const OLLAMA_PORT = 11555;

test.beforeAll(async () => {
  ollama = await startFakeOllama(OLLAMA_PORT);
});
test.afterAll(async () => {
  await new Promise((r) => ollama.close(r));
});

test.describe("signed in", () => {
  test.skip(!process.env.E2E_STORAGE_STATE, "Set E2E_STORAGE_STATE to a recorded Google session (see the comment at the top of this file).");
  test.use({ storageState: process.env.E2E_STORAGE_STATE });

test("complete RAG journey", async ({ page }) => {
  // 1. Signed in via the recorded Google session
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/dashboard/);

  // 2. Choose local Ollama (pointing at the fake server) and test the connection
  await page.goto("/settings");
  await page.getByRole("radio", { name: /Local Ollama/ }).click();
  await page.getByLabel("Ollama endpoint").fill(`http://localhost:${OLLAMA_PORT}`);
  await page.getByRole("button", { name: "Test" }).click();
  await expect(page.getByText(/Connected to Ollama/)).toBeVisible();
  await page.getByRole("button", { name: "Save AI settings" }).click();
  await expect(page.getByText("AI settings saved")).toBeVisible();

  // 3. Create a project from a prompt
  await page.goto("/dashboard");
  await page.getByRole("button", { name: /Create new diagram/ }).click();
  await page.getByLabel("What do you want to explain?").fill("Explain how a RAG architecture works.");
  await page.getByRole("button", { name: "Generate diagram" }).click();
  await expect(page).toHaveURL(/\/editor\//);

  // 4. Generated, editable diagram appears (outline lists components; canvas has elements)
  await expect(page.getByRole("button", { name: "Vector Database" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/Created “RAG Architecture”/)).toBeVisible();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible({ timeout: 15_000 });

  // 5. Modify with natural language → preview → apply
  await page.getByLabel("Message the AI assistant").fill("Add a reranker after the retriever");
  await page.getByLabel("Message the AI assistant").press("Enter");
  await expect(page.getByText("Added a reranker between the retriever and context augmentation")).toBeVisible();
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page.getByRole("button", { name: "Reranker" })).toBeVisible();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible({ timeout: 15_000 });

  // 6. Reload: everything persisted
  await page.reload();
  await expect(page.getByRole("button", { name: "Reranker" })).toBeVisible({ timeout: 20_000 });

  // 7. Export PNG from the editor
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export" }).click();
  await page.getByRole("menuitem", { name: "PNG image" }).click();
  expect((await download).suggestedFilename()).toMatch(/\.png$/);

  // 8. Generate scenes with AI in the presentation studio
  await page.getByRole("link", { name: /Present/ }).click();
  await expect(page).toHaveURL(/\/present/);
  await page.getByRole("button", { name: "Generate scenes with AI" }).click();
  await expect(page.getByText("Complete workflow").first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Saved", { exact: true })).toBeVisible({ timeout: 15_000 });

  // 9. Present, navigate, switch format
  await page.getByRole("link", { name: "Play" }).click();
  await expect(page).toHaveURL(/\/presentation\//);
  const stage = page.getByRole("img").first();
  await expect(stage).toHaveAttribute("aria-label", /The question/);
  await page.keyboard.press("ArrowRight");
  await expect(stage).toHaveAttribute("aria-label", /Retrieval/);
  await page.keyboard.press("o");
  await expect(stage.locator("svg")).toHaveAttribute("viewBox", "0 0 1080 1920");
  await page.keyboard.press("o");
  await expect(stage.locator("svg")).toHaveAttribute("viewBox", "0 0 1920 1080");
});
});

test("login page offers Google sign-in", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("button", { name: "Continue with Google" })).toBeVisible();
});

test("unauthenticated users are redirected away from private pages", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login\?next=%2Fdashboard/);
  const res = await page.request.get("/api/projects");
  expect(res.status()).toBe(401);
});
