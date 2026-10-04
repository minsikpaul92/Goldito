import { expect, test } from "@playwright/test";

import { APP_FRAME, app, box, center, drag, isInside, scrollOffset } from "./helpers";

test.describe("desktop phone frame", () => {
  test("shows the app in a 402 px phone that fits the window", async ({ page }) => {
    await page.goto("/");
    await expect(app(page).getByTestId("welcome")).toBeVisible();

    const frame = await box(page.locator(APP_FRAME));
    const viewport = page.viewportSize()!;
    expect(Math.round(frame.width)).toBe(402);
    expect(frame.y).toBeGreaterThanOrEqual(0);
    expect(frame.y + frame.height).toBeLessThanOrEqual(viewport.height);
    // The app inside knows it is embedded and does not frame itself again.
    await expect(app(page).locator("iframe")).toHaveCount(0);
  });

  test("mirrors routes to the address bar", async ({ page }) => {
    await page.goto("/dev/gestures");
    await expect(app(page).getByTestId("lab-scroll")).toBeVisible();

    // "Go home" → "/" → Welcome (OB.1) — the address bar follows both hops.
    await app(page).getByTestId("lab-home").click();
    await expect(app(page).getByTestId("welcome")).toBeVisible();
    await expect(page).toHaveURL(/\/welcome$/);

    await page.goBack();
    await expect(page).toHaveURL(/\/dev\/gestures$/);

    await page.reload();
    await expect(app(page).getByTestId("lab-scroll")).toBeVisible();
  });

  test("?frame=0 turns the frame off", async ({ page }) => {
    await page.goto("/?frame=0");
    await expect(page.getByTestId("welcome")).toBeVisible();
    await expect(page.locator(APP_FRAME)).toHaveCount(0);
  });
});

test.describe("mouse acts like a finger", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/dev/gestures");
    await expect(app(page).getByTestId("lab-scroll")).toBeVisible();
  });

  test("click is a tap", async ({ page }) => {
    await app(page).getByTestId("row-2").click();
    await expect(app(page).getByTestId("tap-count")).toHaveText("1");
    await expect(app(page).getByTestId("last-tap")).toHaveText("Row 2");
  });

  test("wheel scrolls the app screen, not the page", async ({ page }) => {
    const scroller = app(page).getByTestId("lab-scroll");
    const start = center(await box(page.locator(APP_FRAME)));
    await page.mouse.move(start.x, start.y);
    await page.mouse.wheel(0, 500);

    await expect.poll(() => scrollOffset(scroller)).toBeGreaterThan(0);
    const outerScrolled = await page.evaluate(() =>
      [...document.querySelectorAll("div")].some((el) => el.scrollTop > 0),
    );
    expect(outerScrolled).toBe(false);
  });

  test("dragging scrolls and never taps", async ({ page }) => {
    const scroller = app(page).getByTestId("lab-scroll");
    const start = center(await box(page.locator(APP_FRAME)));
    await drag(page, start, { x: start.x, y: start.y - 250 });

    await expect.poll(() => scrollOffset(scroller)).toBeGreaterThan(100);
    await expect(app(page).getByTestId("tap-count")).toHaveText("0");
    await expect(app(page).getByTestId("lab-modal")).toHaveCount(0);
  });

  test("a quick flick keeps scrolling after release", async ({ page, browserName }) => {
    // Velocity depends on event timing, which parallel WebKit/Firefox runs stretch out;
    // the momentum code is engine-independent, so Chromium guards it.
    test.skip(browserName !== "chromium", "timing-sensitive; covered on Chromium");
    const scroller = app(page).getByTestId("lab-scroll");
    const start = center(await box(page.locator(APP_FRAME)));
    await drag(page, start, { x: start.x, y: start.y - 150 }, 3);

    const atRelease = await scrollOffset(scroller);
    await expect.poll(() => scrollOffset(scroller)).toBeGreaterThan(atRelease + 20);
  });

  test("dragging moves the chip row sideways without selecting a chip", async ({ page }) => {
    const row = app(page).getByTestId("chip-row");
    const start = center(await box(row));
    await drag(page, start, { x: start.x - 150, y: start.y });

    await expect.poll(() => scrollOffset(row, "x")).toBeGreaterThan(50);
    await expect(app(page).getByTestId("tap-count")).toHaveText("0");
  });

  test("mouse wheel moves the chip row sideways", async ({ page }) => {
    const row = app(page).getByTestId("chip-row");
    const scroller = app(page).getByTestId("lab-scroll");
    const start = center(await box(row));
    await page.mouse.move(start.x, start.y);
    await page.mouse.wheel(0, 200);

    await expect.poll(() => scrollOffset(row, "x")).toBeGreaterThan(50);
    expect(await scrollOffset(scroller)).toBe(0);
  });

  test("paged photos settle on the next page after a swipe past half", async ({ page }) => {
    const pager = app(page).getByTestId("pager");
    const pageWidth = await pager.evaluate((el) => el.clientWidth);
    const pagerBox = await box(pager);
    // Start near the right edge so the whole swipe stays inside the phone.
    const start = { x: pagerBox.x + pagerBox.width - 20, y: center(pagerBox).y };
    await drag(page, start, { x: start.x - pageWidth * 0.6, y: start.y });

    await expect
      .poll(async () => Math.abs((await scrollOffset(pager, "x")) - pageWidth))
      .toBeLessThanOrEqual(2);
  });

  test("modals and toasts stay inside the phone", async ({ page }) => {
    const frame = await box(page.locator(APP_FRAME));

    await app(page).getByText("Open modal").click();
    const modal = app(page).getByTestId("lab-modal");
    await expect(modal).toBeVisible();
    expect(isInside(await box(modal), frame)).toBe(true);
    await app(page).getByText("Close").click();
    await expect(modal).toHaveCount(0);

    await app(page).getByText("Show toast").click();
    const toast = app(page).getByTestId("lab-toast");
    await expect(toast).toBeVisible();
    expect(isInside(await box(toast), frame)).toBe(true);
  });

  test("text fields still take typing", async ({ page }) => {
    const input = app(page).getByTestId("lab-input");
    await input.click();
    await page.keyboard.type("Max");
    await expect(input).toHaveValue("Max");
  });
});
