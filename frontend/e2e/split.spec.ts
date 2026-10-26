import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { APP_FRAME, app } from "./helpers";
import { OWNER, SITTER, mockSupabase } from "./supabaseMock";

// Split view (10.10): on a wide computer window `?view=split` shows two phones side by side. Each starts at the login
// screen with its own session, and the account that signs in is named above the phone. One phone stays the default.

test.use({ viewport: { width: 1440, height: 900 } });

// Same strings as lib/demo.ts; the password is the CI build's test-only EXPO_PUBLIC_DEMO_PASSWORD.
const demoOwner = { ...OWNER, email: "demo-owner@goldito.test", password: "e2e-demo-password" };
const demoSitter = { ...SITTER, email: "demo-sitter@goldito.test", password: "e2e-demo-password" };

const LEFT_PANE = 'iframe[name="pane-left"]';
const RIGHT_PANE = 'iframe[name="pane-right"]';

async function paneUrl(page: Page, name: string): Promise<string> {
  const frame = page.frame({ name });
  return frame ? frame.url() : "";
}

test.describe("split view", () => {
  test("two phones start signed out; each signs in on its own and is named above the phone", async ({ page }) => {
    await mockSupabase(page, [demoOwner, demoSitter]);
    await page.goto("/?view=split");

    await expect(page.locator(LEFT_PANE)).toHaveCount(1);
    await expect(page.locator(RIGHT_PANE)).toHaveCount(1);
    await expect(page.locator(APP_FRAME)).toHaveCount(0); // not the one-phone frame
    await expect(page.getByText("Not logged in")).toHaveCount(2);
    await expect.poll(() => paneUrl(page, "pane-left")).toMatch(/\/login$/);
    await expect.poll(() => paneUrl(page, "pane-right")).toMatch(/\/login$/);

    await page.frameLocator(LEFT_PANE).getByTestId("demo-owner").click();
    await page.frameLocator(RIGHT_PANE).getByTestId("demo-sitter").click();
    await expect.poll(() => paneUrl(page, "pane-left")).toMatch(/\/owner$/);
    await expect.poll(() => paneUrl(page, "pane-right")).toMatch(/\/sitter$/);
    await expect(page.getByText("Robert · Owner")).toBeVisible();
    await expect(page.getByText("Chloe · Sitter")).toBeVisible();
    // The phones don't take over the address bar.
    await expect(page).toHaveURL(/\/\?view=split$/);

    // Each phone keeps its own session: signing the sitter out leaves the owner signed in, even after a reload.
    await page.frameLocator(RIGHT_PANE).getByTestId("open-menu").click();
    await page.frameLocator(RIGHT_PANE).getByTestId("log-out").click();
    await expect.poll(() => paneUrl(page, "pane-right")).toMatch(/\/welcome$/);
    await expect(page.getByText("Not logged in")).toHaveCount(1);
    await page.frameLocator(LEFT_PANE).locator("body").evaluate(() => window.location.reload());
    await expect.poll(() => paneUrl(page, "pane-left")).toMatch(/\/owner$/);
    await expect(page.frameLocator(LEFT_PANE).getByTestId("open-menu")).toBeVisible();
  });

  test("Show both phones / Show one phone switch between the views", async ({ page }) => {
    await mockSupabase(page, [demoOwner, demoSitter]);
    await page.goto("/");
    await expect(app(page).getByTestId("welcome")).toBeVisible();

    await page.getByTestId("show-both-phones").click();
    await expect(page).toHaveURL(/\/\?view=split$/);
    await expect(page.locator(LEFT_PANE)).toHaveCount(1);

    await page.getByTestId("show-one-phone").click();
    await expect(page.locator(APP_FRAME)).toHaveCount(1);
    await expect(page.locator(LEFT_PANE)).toHaveCount(0);
  });

  test("a window narrower than 900 px gets one phone even with ?view=split", async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 900 });
    await mockSupabase(page, [demoOwner, demoSitter]);
    await page.goto("/?view=split");
    await expect(page.locator(APP_FRAME)).toHaveCount(1);
    await expect(page.locator(LEFT_PANE)).toHaveCount(0);
    await expect(page.getByTestId("show-both-phones")).toHaveCount(0);
  });

  test("narrowing to one phone and widening again brings both phones back", async ({ page }) => {
    await mockSupabase(page, [demoOwner, demoSitter]);
    await page.goto("/?view=split");
    await expect(page.locator(LEFT_PANE)).toHaveCount(1);

    await page.setViewportSize({ width: 800, height: 900 });
    await expect(page.locator(APP_FRAME)).toHaveCount(1);

    await page.setViewportSize({ width: 1440, height: 900 });
    await expect(page.locator(LEFT_PANE)).toHaveCount(1);
    await expect(page.locator(RIGHT_PANE)).toHaveCount(1);
    await expect(page).toHaveURL(/\/\?view=split$/);
    await expect.poll(() => paneUrl(page, "pane-right")).toMatch(/\/login$/);
  });
});
