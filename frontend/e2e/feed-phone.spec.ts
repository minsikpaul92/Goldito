import { expect, test } from "@playwright/test";
import type { CDPSession, Page } from "@playwright/test";

import { caring } from "./careFixtures";
import { OWNER, SITTER, mockSupabase } from "./supabaseMock";

// The Feed viewer on a touch phone (no desktop frame): a finger swipes to the next photo and a pinch zooms (#345).

const PET = "00000000-0000-4000-8000-0000000000aa";

async function openViewer(page: Page) {
  const { db } = await mockSupabase(page, [OWNER, SITTER]);
  caring(db, [{ id: PET, name: "Max", species: "dog" }]);
  for (const [id, minutes] of [["t-1", 10], ["t-2", 20], ["t-3", 30]] as const) {
    db.media.push({ id: `m-${id}`, pet_id: PET, cloudinary_public_id: `goldito/${PET}/feed/${id}`, resource_type: "image", purpose: "feed" });
    db.feed_posts.push({
      id, pet_id: PET, sitter_id: SITTER.id, posted_by: SITTER.id, visibility: "shared", media_id: `m-${id}`,
      caption: id, caption_source: "fallback", task_log_id: null, created_at: new Date(Date.now() - minutes * 60_000).toISOString(),
    });
  }
  await page.goto("/login");
  await page.getByTestId("login-email").fill(SITTER.email);
  await page.getByTestId("login-password").fill(SITTER.password);
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await page.getByRole("heading", { name: /^(Home|Today)$/ }).first().waitFor();
  await page.goto("/sitter/feed");
  await page.getByTestId("feed-card-t-2").tap();
  await page.getByTestId("feed-viewer-page-t-2").waitFor();
}

async function swipe(cdp: CDPSession, from: { x: number; y: number }, to: { x: number; y: number }) {
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [from] });
  for (let i = 1; i <= 8; i++) {
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: from.x + ((to.x - from.x) * i) / 8, y: from.y + ((to.y - from.y) * i) / 8 }],
    });
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
}

test.describe("Feed viewer with a finger", () => {
  test("a swipe left shows the next photo, a swipe right the one before", async ({ page }) => {
    await openViewer(page);
    const cdp = await page.context().newCDPSession(page);
    const media = (await page.getByTestId("feed-viewer-media").boundingBox())!;
    const y = media.y + media.height / 2;
    // The viewer fades in; a finger that lands before it settles can be lost, so swipe again until the page turns.
    await expect(async () => {
      await swipe(cdp, { x: media.x + media.width * 0.7, y }, { x: media.x + media.width * 0.3, y });
      await expect(page.getByTestId("feed-viewer-page-t-3")).toBeVisible({ timeout: 1500 });
    }).toPass({ timeout: 15_000 });
    await expect(async () => {
      await swipe(cdp, { x: media.x + media.width * 0.3, y }, { x: media.x + media.width * 0.7, y });
      await expect(page.getByTestId("feed-viewer-page-t-2")).toBeVisible({ timeout: 1500 });
    }).toPass({ timeout: 15_000 });
  });

  test("a pinch zooms the photo in and out", async ({ page }) => {
    await openViewer(page);
    const cdp = await page.context().newCDPSession(page);
    const layer = page.getByTestId("feed-viewer-zoom");
    const scale = () => layer.evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).a);
    const media = (await page.getByTestId("feed-viewer-media").boundingBox())!;
    const at = { x: media.x + media.width / 2, y: media.y + media.height / 2 };
    expect(await scale()).toBeCloseTo(1, 2);
    const pinch = (scaleFactor: number) =>
      cdp.send("Input.synthesizePinchGesture", { ...at, scaleFactor, relativeSpeed: 400, gestureSourceType: "touch" });
    // A synthetic pinch can be dropped while the page is still settling: ask again until the photo has zoomed.
    await expect(async () => {
      await pinch(2.5);
      expect(await scale()).toBeGreaterThan(1.8);
    }).toPass({ timeout: 20_000 });
    // Zoomed in, the edges do not turn the page.
    await expect(page.getByTestId("feed-viewer-next")).toHaveCount(0);
    await expect(async () => {
      await pinch(0.3);
      expect(await scale()).toBeCloseTo(1, 1);
    }).toPass({ timeout: 20_000 });
    await expect(page.getByTestId("feed-viewer-next")).toBeVisible();
  });
});
