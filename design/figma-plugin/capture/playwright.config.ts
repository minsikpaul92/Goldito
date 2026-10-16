import { defineConfig } from "@playwright/test";

// Captures the prototype screens for the Figma plugin. Uses the installed Chrome.
export default defineConfig({
  testDir: ".",
  testMatch: /\.spec\.ts/,
  workers: 1,
  reporter: "list",
  use: { channel: "chrome", headless: true },
});
