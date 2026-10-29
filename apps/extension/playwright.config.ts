import { defineConfig } from "@playwright/test";

// Real-browser checks of the built extension (npm run build first). Each test gets its own
// Chromium profile and its own test stores on free ports, so they can run in parallel.
// Output goes under the git-ignored coverage/.
export default defineConfig({
  testDir: "e2e",
  testMatch: "**/*.e2e.ts",
  outputDir: "../../coverage/extension-e2e/results",
  timeout: 90_000,
  expect: { timeout: 8_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI
    ? [["github"], ["html", { outputFolder: "../../coverage/extension-e2e/report", open: "never" }]]
    : [["list"], ["html", { outputFolder: "../../coverage/extension-e2e/report", open: "never" }]],
  use: {
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
});
