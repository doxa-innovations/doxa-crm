import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60000,
  workers: 1,
  retries: 0,
  use: {
    baseURL: "http://127.0.0.1:3105",
    headless: true,
    viewport: { width: 1440, height: 900 },
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
    },
  },
  reporter: "list",
});
