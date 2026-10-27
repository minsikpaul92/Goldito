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

// PW_BROWSERS="chromium" runs the frame checks in one browser (CI on PRs); unset runs chromium, firefox and webkit.
const wanted = (process.env.PW_BROWSERS ?? "").split(/[\s,]+/).filter(Boolean);
const frameBrowsers = wanted.length ? browsers.filter((b) => wanted.includes(b.name)) : browsers;

// PW_FRAME_VIEWPORTS=1366 runs the frame checks at one size (CI on PRs); unset or "all" runs every size.
const only = process.env.PW_FRAME_VIEWPORTS;
const viewports = only && only !== "all" ? allViewports.filter((v) => String(v.width) === only) : allViewports;

// App flows — logic, not layout: they run once, in the "flows" project. Every other spec (except the phone one) is a
// frame check that runs in each frame browser × viewport. One list for both, so a new spec can't land in both or
// neither (CR-10). `privacy` is the public privacy page spec (10.11).
const FLOW_SPECS = new RegExp(
  `(${[
    "auth", "pets", "profile", "schedule", "sitters", "booking", "sitter-bookings", "negotiation", "meet-greet",
    "handoff", "rebook", "today", "checkout", "welcome", "media-picker", "feed", "care-tasks", "sitter-tasks",
    "quick-checkin", "diary", "sitter-home", "live-updates", "due-reminder", "care-request", "heads-up", "report",
    "caption", "completion", "demo-tools", "location", "home-location", "transit", "privacy", "snap",
    "treat-check", "mood", "sticker", "decor", "diary-owner-entry", "photo-request", "split", "settings", "sitter-onboarding", "demo-sets", "profile-photos", "skin", "chat", "chat-trip", "chat-handoff", "owner-onboarding-logic", "owner-onboarding", "pet-glance", "pet-status", "pet-sprite", "pet-scene", "pet-behavior", "pet-wardrobe", "pet-room", "pet-room-sitter", "pet-medal", "sitter-badges",
  ].join("|")})\\.spec\\.ts$`,
);
const PHONE_SPEC = /phone\.spec\.ts$/;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  // GitHub's public-repo runners have 4 vCPUs; Playwright's default would use only half of them.
  workers: process.env.CI ? 4 : undefined,
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
    ...frameBrowsers.flatMap((browser) =>
      viewports.map((viewport) => ({
        name: `${browser.name}-${viewport.width}x${viewport.height}`,
        testIgnore: [PHONE_SPEC, FLOW_SPECS],
        use: { ...browser.device, viewport },
      })),
    ),
    {
      name: "phone",
      testMatch: PHONE_SPEC,
      use: { ...devices["Pixel 7"] },
    },
    {
      // App flows — logic, not layout, so one desktop browser is enough. Tall enough that the phone frame is not scaled
      // down (it needs about 970 px), so sizes measured on the page are the design sizes.
      name: "flows",
      testMatch: FLOW_SPECS,
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 1000 } },
    },
  ],
});
