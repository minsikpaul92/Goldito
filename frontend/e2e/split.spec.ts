import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { APP_FRAME, app } from "./helpers";
import { OWNER, SITTER, mockSupabase } from "./supabaseMock";

// Split view (10.10): on a wide computer window `?view=split` shows the owner and sitter phones side by side,
// each signed in to its own demo account; one phone stays the default (choice A, 2026-10-15).

test.use({ viewport: { width: 1440, height: 900 } });

// Same strings as lib/demo.ts; the password is the CI build's test-only EXPO_PUBLIC_DEMO_PASSWORD.
const demoOwner = { ...OWNER, email: "demo-owner@goldito.test", password: "e2e-demo-password" };
const demoSitter = { ...SITTER, email: "demo-sitter@goldito.test", password: "e2e-demo-password" };

const OWNER_PANE = 'iframe[name="pane-owner"]';
const SITTER_PANE = 'iframe[name="pane-sitter"]';

async function paneUrl(page: Page, name: string): Promise<string> {
  const frame = page.frame({ name });
  return frame ? frame.url() : "";
}

test.describe("split view", () => {
  test("two phones, each signed in to its own demo account at the same time", async ({ page }) => {
    await mockSupabase(page, [demoOwner, demoSitter]);
    await page.goto("/?view=split");

    await expect(page.locator(OWNER_PANE)).toHaveCount(1);
    await expect(page.locator(SITTER_PANE)).toHaveCount(1);
    await expect(page.locator(APP_FRAME)).toHaveCount(0); // not the one-phone frame
    await expect(page.getByText("Owner · Robert")).toBeVisible();
    await expect(page.getByText("Sitter · Chloe")).toBeVisible();

    await expect.poll(() => paneUrl(page, "pane-owner")).toMatch(/\/owner$/);
    await expect.poll(() => paneUrl(page, "pane-sitter")).toMatch(/\/sitter$/);
    await expect(page.frameLocator(OWNER_PANE).getByTestId("log-out")).toBeVisible();
    await expect(page.frameLocator(SITTER_PANE).getByTestId("log-out")).toBeVisible();
    // The phones don't take over the address bar.
    await expect(page).toHaveURL(/\/\?view=split$/);

    // Each phone keeps its own session: signing the sitter out leaves the owner signed in, even after a reload.
    await page.frameLocator(SITTER_PANE).getByTestId("log-out").click();
    await expect.poll(() => paneUrl(page, "pane-sitter")).toMatch(/\/welcome$/);
    await page.frameLocator(OWNER_PANE).locator("body").evaluate(() => window.location.reload());
    await expect.poll(() => paneUrl(page, "pane-owner")).toMatch(/\/owner$/);
    await expect(page.frameLocator(OWNER_PANE).getByTestId("log-out")).toBeVisible();
  });

  test("Show both phones / Show one phone switch between the views", async ({ page }) => {
    await mockSupabase(page, [demoOwner, demoSitter]);
    await page.goto("/");
    await expect(app(page).getByTestId("welcome")).toBeVisible();

    await page.getByTestId("show-both-phones").click();
    await expect(page).toHaveURL(/\/\?view=split$/);
    await expect(page.locator(OWNER_PANE)).toHaveCount(1);

    await page.getByTestId("show-one-phone").click();
    await expect(page.locator(APP_FRAME)).toHaveCount(1);
    await expect(page.locator(OWNER_PANE)).toHaveCount(0);
  });

  test("a window narrower than 900 px gets one phone even with ?view=split", async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 900 });
    await mockSupabase(page, [demoOwner, demoSitter]);
    await page.goto("/?view=split");
    await expect(page.locator(APP_FRAME)).toHaveCount(1);
    await expect(page.locator(OWNER_PANE)).toHaveCount(0);
    await expect(page.getByTestId("show-both-phones")).toHaveCount(0);
  });
});
