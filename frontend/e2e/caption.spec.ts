import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { mockUpload } from "./careFixtures";
import { NOON_TORONTO, app, signIn } from "./helpers";
import { OWNER, SITTER, mockSupabase } from "./supabaseMock";

// Photo captions and the feed album (phase-09 9.1–9.5): the sitter only uploads; the model writes the caption and
// picks the album; if it can't, the post still goes out. The AI endpoint is mocked (pytest covers the real one).

const PET_ID = "00000000-0000-4000-8000-0000000000aa";

async function openSitterFeed(page: Page, caption: { status: number; body?: object; delayMs?: number }) {
  const { db } = await mockSupabase(page, [OWNER, SITTER]);
  db.pets.push({ id: PET_ID, owner_id: OWNER.id, species: "dog", name: "Max", breed: null, notes: null });
  await mockUpload(page, db, PET_ID);
  const asked: Record<string, unknown>[] = [];
  await page.route("**/api/ai/caption", async (route) => {
    asked.push(route.request().postDataJSON());
    if (caption.delayMs) await new Promise((r) => setTimeout(r, caption.delayMs));
    return route.fulfill({
      status: caption.status,
      contentType: "application/json",
      body: JSON.stringify(caption.body ?? {}),
    });
  });
  await signIn(page, SITTER);
  await app(page).getByRole("heading", { name: "Home" }).waitFor();
  await page.goto(`/sitter/feed/${PET_ID}`);
  await app(page).getByTestId("feed-add-photo").waitFor();
  return { db, asked };
}

async function addSamplePhoto(page: Page) {
  await app(page).getByTestId("feed-add-photo").click();
  await app(page).getByTestId("sample-walk").click();
}

test.describe("photo caption", () => {
  test("the sitter only uploads: the model's caption and album are saved, with a Writing a caption… step", async ({ page }) => {
    const { db, asked } = await openSitterFeed(page, {
      status: 200,
      delayMs: 1200,
      body: { caption: "Max sniffing autumn leaves 🍂", category: "walk", source: "ai", model: "m", latency_ms: 900 },
    });
    await addSamplePhoto(page);
    await expect(app(page).getByTestId("feed-uploading-text")).toHaveText("Writing a caption…");
    await expect(app(page).getByTestId("toast")).toContainText("Shared with Robert");

    expect(asked).toEqual([{ pet_id: PET_ID, media_id: "media-proof" }]);
    expect(db.feed_posts).toHaveLength(1);
    expect(db.feed_posts[0]).toMatchObject({
      media_id: "media-proof", caption: "Max sniffing autumn leaves 🍂", caption_source: "ai", category: "walk", posted_by: SITTER.id,
    });
    // No caption field anywhere on the sitter's screen.
    await expect(app(page).getByRole("textbox")).toHaveCount(0);
  });

  test("when the caption fails the post still goes out with the fallback caption and no album", async ({ page }) => {
    const { db } = await openSitterFeed(page, { status: 502, body: { detail: "down" } });
    await addSamplePhoto(page);
    await expect(app(page).getByTestId("toast")).toContainText("Shared with Robert");
    expect(db.feed_posts[0]).toMatchObject({ caption: "A moment from today's care 🐾", caption_source: "fallback", category: null });
  });

  test("the server's own fallback caption is kept and marked as a fallback", async ({ page }) => {
    const { db } = await openSitterFeed(page, {
      status: 200,
      body: { caption: "Max had a lovely moment today 🐾", category: null, source: "fallback", model: "fallback", latency_ms: 0 },
    });
    await addSamplePhoto(page);
    await expect(app(page).getByTestId("toast")).toContainText("Shared with Robert");
    expect(db.feed_posts[0]).toMatchObject({ caption: "Max had a lovely moment today 🐾", caption_source: "fallback", category: null });
  });
});

test.describe("feed album", () => {
  const post = (n: number) => `00000000-0000-4000-8000-00000000f10${n}`;
  const mediaId = (n: number) => `00000000-0000-4000-8000-00000000e10${n}`;
  // [category, days ago, hours offset]: today two meals + a walk, yesterday a nap and an uncategorised photo.
  const SEED: [string | null, number][] = [["meal", 0], ["meal", 0], ["walk", 0], ["nap", 1], [null, 1], ["other", 1]];

  async function seeded(page: Page) {
    // A fixed clock before the first navigation: "today" and "yesterday" are Toronto days, so the seed must not
    // straddle midnight whenever CI happens to run.
    await page.clock.setFixedTime(NOON_TORONTO);
    const { db } = await mockSupabase(page, [OWNER, SITTER], { now: NOON_TORONTO });
    db.pets.push({ id: PET_ID, owner_id: OWNER.id, species: "dog", name: "Max", breed: null, notes: null });
    SEED.forEach(([category, daysAgo], i) => {
      db.media.push({
        id: mediaId(i), pet_id: PET_ID, cloudinary_public_id: `goldito/${PET_ID}/feed/a${i}`, resource_type: "image",
        purpose: "feed", width: 1200, height: 900, duration_s: null,
      });
      db.feed_posts.push({
        id: post(i), pet_id: PET_ID, sitter_id: SITTER.id, posted_by: SITTER.id, visibility: "shared", media_id: mediaId(i),
        caption: `Caption ${i}`, caption_source: "ai", category, task_log_id: null,
        created_at: new Date(NOON_TORONTO.getTime() - daysAgo * 86_400_000 - i * 60_000).toISOString(),
      });
    });
    await signIn(page, OWNER);
    await app(page).getByRole("heading", { name: "Home" }).waitFor();
    await page.goto("/owner/feed");
    await app(page).getByTestId("feed-mode").waitFor();
  }

  test("Album groups each day's photos by what they show, hides empty groups, and opens a photo", async ({ page }) => {
    await seeded(page);
    const screen = app(page);
    await expect(screen.getByTestId(`feed-card-${post(0)}`)).toBeVisible(); // Timeline is the default

    await screen.getByTestId("feed-mode-album").click();
    await expect(screen.getByTestId("feed-album")).toBeVisible();
    await expect(screen.getByTestId(`feed-card-${post(0)}`)).toHaveCount(0);

    const days = await screen.locator("[data-testid^='album-day-']").evaluateAll((els) => els.map((e) => e.getAttribute("data-testid")));
    expect(days).toHaveLength(2); // today first, yesterday second
    const today = days[0]!.replace("album-day-", "");
    const yesterday = days[1]!.replace("album-day-", "");
    expect(today > yesterday).toBe(true);

    await expect(screen.getByTestId(`album-group-${today}-meal`)).toContainText("🍚 Meals · 2");
    await expect(screen.getByTestId(`album-group-${today}-walk`)).toContainText("🐕 Walks · 1");
    await expect(screen.getByTestId(`album-group-${today}-nap`)).toHaveCount(0); // empty groups are hidden
    await expect(screen.getByTestId(`album-group-${today}-play`)).toHaveCount(0);
    await expect(screen.getByTestId(`album-group-${yesterday}-nap`)).toContainText("😴 Naps · 1");
    // "other" and no category share "Moments".
    await expect(screen.getByTestId(`album-group-${yesterday}-moments`)).toContainText("✨ Moments · 2");

    await screen.getByTestId(`album-photo-${post(3)}`).click();
    await expect(screen.getByTestId(`feed-viewer-page-${post(3)}`)).toBeVisible();
  });

  test("switching back to Timeline shows the cards again", async ({ page }) => {
    await seeded(page);
    const screen = app(page);
    await screen.getByTestId("feed-mode-album").click();
    await screen.getByTestId("feed-mode-timeline").click();
    await expect(screen.getByTestId("feed-album")).toHaveCount(0);
    await expect(screen.getByTestId(`feed-card-${post(1)}`)).toBeVisible();
  });
});
