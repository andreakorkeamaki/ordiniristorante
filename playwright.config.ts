import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000",
    trace: "on-first-retry",
  },
  projects: [
    { name: "mobile", use: { ...devices["iPhone 13"] } },
    { name: "tablet", use: { ...devices["Desktop Chrome"], viewport: { width: 1180, height: 820 } } },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://127.0.0.1:3000/menu",
    reuseExistingServer: true,
  },
});
