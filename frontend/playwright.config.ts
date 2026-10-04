import { defineConfig, devices } from "@playwright/test";

/**
 * Mouse-only checks of the desktop phone frame (task 1.7, architecture D25) and the
 * auth / role routing flows against a mocked Supabase (phase-03).
 * Runs against `expo export -p web` built with EXPO_PUBLIC_DEV_ROUTES=1 and
 * EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:4173/supabase-mock (no backend or real project).
 */
const PORT = 4173;

const browsers = [
  { name: "chromium", device: devices["Desktop Chrome"] },
  { name: "firefox", device: devices["Desktop Firefox"] },
  { name: "webkit", device: devices["Desktop Safari"] },
];

const allViewports = [
  { width: 1366, height: 768 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
];

// PW_FRAME_VIEWPORTS=1366 runs the frame checks at one size (CI on PRs); unset or "all" runs every size.
const only = process.env.PW_FRAME_VIEWPORTS;
const viewports = only && only !== "all" ? allViewports.filter((v) => String(v.width) === only) : allViewports;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "retain-on-failure",
  },
  webServer: {
    command: `node e2e/static-server.mjs dist ${PORT}`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    ...browsers.flatMap((browser) =>
      viewports.map((viewport) => ({
        name: `${browser.name}-${viewport.width}x${viewport.height}`,
        testIgnore: /(phone|auth|pets|profile|schedule|sitters|booking|sitter-bookings|negotiation|meet-greet|handoff|rebook|today|checkout)\.spec\.ts/,
        use: { ...browser.device, viewport },
      })),
    ),
    {
      name: "phone",
      testMatch: /phone\.spec\.ts/,
      use: { ...devices["Pixel 7"] },
    },
    {
      // App flows (auth, pets, profile, schedule, sitters, booking, sitter-bookings, negotiation, meet-greet, handoff, rebook, today, checkout) — logic, not layout, so one desktop browser is enough.
      name: "flows",
      testMatch: /(auth|pets|profile|schedule|sitters|booking|sitter-bookings|negotiation|meet-greet|handoff|rebook|today|checkout)\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
  ],
});
