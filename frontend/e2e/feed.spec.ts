import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { caring, mockUpload } from "./careFixtures";
import { HOUR } from "./careFixtures";
import { NOON_TORONTO, TODAY_TORONTO, app, box, drag, signIn } from "./helpers";
import { OWNER, SITTER, mockFeedApi, mockSupabase } from "./supabaseMock";
import type { MockDb, MockUser } from "./supabaseMock";

// The Feed (phase-05 5.2 · 5.5 · 5.7 · 5.10, #345): viewer, mosaic and filters, hide, delete from my side or for both,
// a stay that is over, and the notification center.

const PET_ID = "00000000-0000-4000-8000-0000000000aa";
const post = (n: number) => `00000000-0000-4000-8000-00000000f00${n}`;
const media = (n: number) => `00000000-0000-4000-8000-00000000e00${n}`;
// Newest first: a video (index 0), then two photos.
const KINDS = ["video", "image", "image"] as const;

async function setup(page: Page, user: MockUser) {
  const { db } = await mockSupabase(page, [OWNER, SITTER]);
  caring(db, [{ id: PET_ID, name: "Max", species: "dog" }]);
  KINDS.forEach((kind, i) => {
    db.media.push({
      id: media(i),
      pet_id: PET_ID,
      cloudinary_public_id: `goldito/${PET_ID}/feed/m${i}`,
      resource_type: kind,
      purpose: "feed",
      width: 1200,
      height: 900,
      duration_s: kind === "video" ? 12 : null,
    });
    db.feed_posts.push({
      id: post(i),
      pet_id: PET_ID,
      sitter_id: SITTER.id,
      posted_by: SITTER.id,
      visibility: "shared",
      media_id: media(i),
      caption: `Caption ${i}`,
      caption_source: "fallback",
      task_log_id: null,
      created_at: new Date(Date.now() - i * 3_600_000).toISOString(),
    });
  });

  const { calls } = await mockFeedApi(page, db);

  await signIn(page, user);
  await app(page).getByRole("heading", { name: /^(Home|Today)$/ }).first().waitFor();
  return { db, calls };
}

test.describe("Feed viewer", () => {
  test("a tapped photo opens that photo, not the first video", async ({ page }) => {
    await setup(page, OWNER);
    await page.goto("/owner/feed");
    await app(page).getByTestId(`feed-card-${post(2)}`).click();

    await expect(app(page).getByTestId(`feed-viewer-page-${post(2)}`)).toBeVisible();
    await expect(app(page).getByTestId("feed-viewer-video")).toHaveCount(0);
    await expect(app(page).getByTestId(`feed-viewer-page-${post(0)}`)).toHaveCount(0);
  });

  test("arrows and arrow keys move between posts; only the active post is mounted", async ({ page }) => {
    await setup(page, OWNER);
    await page.goto("/owner/feed");
    await app(page).getByTestId(`feed-card-${post(1)}`).click();
    await expect(app(page).getByTestId(`feed-viewer-page-${post(1)}`)).toBeVisible();

    await app(page).getByTestId("feed-viewer-next").click();
    await expect(app(page).getByTestId(`feed-viewer-page-${post(2)}`)).toBeVisible();
    await expect(app(page).getByTestId("feed-viewer-next")).toHaveCount(0);

    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ArrowLeft");
    await expect(app(page).getByTestId(`feed-viewer-page-${post(0)}`)).toBeVisible();
    await expect(app(page).getByTestId("feed-viewer-video")).toBeVisible();
    await expect(app(page).getByTestId(`feed-viewer-page-${post(1)}`)).toHaveCount(0);
  });

  test("the photo shows its tag, its date and time, and the memo", async ({ page }) => {
    const { db } = await setup(page, OWNER);
    Object.assign(db.feed_posts[1], { category: "meal", note: "Cleaned the bowl", created_at: "2026-10-09T13:02:00Z" });
    await page.goto("/owner/feed");
    await app(page).getByTestId(`feed-card-${post(1)}`).click();
    await expect(app(page).getByTestId("feed-viewer-tag")).toContainText("Meals");
    await expect(app(page).getByTestId("feed-viewer-note")).toHaveText("Cleaned the bowl");
    await expect(app(page).getByTestId("feed-viewer-date")).toHaveText("Oct 9, 2026 · 9:02 AM");
  });

  test("a photo with no tag shows only its date and time", async ({ page }) => {
    await setup(page, OWNER);
    await page.goto("/owner/feed");
    await app(page).getByTestId(`feed-card-${post(1)}`).click();
    await expect(app(page).getByTestId("feed-viewer-page-" + post(1))).toBeVisible();
    await expect(app(page).getByTestId("feed-viewer-tag")).toHaveCount(0);
    await expect(app(page).getByTestId("feed-viewer-note")).toHaveCount(0);
    await expect(app(page).getByTestId("feed-viewer-date")).toBeVisible();
  });
});

test.describe("Delete and hide", () => {
  const sheetBody = (page: Page) => app(page).getByTestId("feed-delete-body");

  test("the owner deleting a sitter's photo says it goes from their side only, and the sitter keeps it", async ({ page }) => {
    const { db, calls } = await setup(page, OWNER);
    await page.goto("/owner/feed");
    await app(page).getByTestId(`feed-card-${post(1)}`).click();
    await app(page).getByTestId("feed-viewer-delete").click();
    await expect(sheetBody(page)).toHaveText("It will be deleted on your side only.");
    await expect(app(page).getByTestId("feed-delete-both")).toHaveCount(0);
    await app(page).getByTestId("feed-delete-confirm").click();
    await expect(app(page).getByTestId("toast")).toContainText("Photo deleted");
    expect(calls).toEqual([{ id: post(1), scope: "me", by: OWNER.id }]);
    await expect(app(page).getByTestId(`feed-card-${post(1)}`)).toHaveCount(0);
    // The post is still there for the sitter, with the owner's removal on the side.
    expect(db.feed_posts.some((p) => p.id === post(1))).toBe(true);
    expect(db.feed_post_hidden).toMatchObject([{ post_id: post(1), user_id: OWNER.id, state: "removed" }]);
  });

  test("cancel keeps the photo and reopens on it; after 30 minutes the sitter's delete is on their side only", async ({ page }) => {
    const { calls } = await setup(page, SITTER);
    await page.goto(`/sitter/feed/${PET_ID}`);
    await app(page).getByTestId(`feed-card-${post(1)}`).click();
    await app(page).getByTestId("feed-viewer-next").click();
    await expect(app(page).getByTestId(`feed-viewer-page-${post(2)}`)).toBeVisible();

    await app(page).getByTestId("feed-viewer-delete").click();
    await expect(app(page).getByTestId("feed-delete-sheet")).toBeVisible();
    await expect(sheetBody(page)).toHaveText("It will be deleted on your side only.");
    await app(page).getByTestId("feed-delete-sheet-close").click();
    expect(calls).toEqual([]);
    // Back on the photo that was being deleted, not the one first tapped.
    await expect(app(page).getByTestId(`feed-viewer-page-${post(2)}`)).toBeVisible();

    await app(page).getByTestId("feed-viewer-delete").click();
    await app(page).getByTestId("feed-delete-confirm").click();
    await expect(app(page).getByTestId("toast")).toContainText("Photo deleted");
    expect(calls).toEqual([{ id: post(2), scope: "me", by: SITTER.id }]);
    await expect(app(page).getByTestId(`feed-card-${post(2)}`)).toHaveCount(0);
    await expect(app(page).getByTestId(`feed-card-${post(1)}`)).toBeVisible();
  });

  async function freshPost(db: MockDb) {
    db.media.push({ id: media(7), pet_id: PET_ID, cloudinary_public_id: `goldito/${PET_ID}/feed/new`, resource_type: "image", purpose: "feed" });
    db.feed_posts.push({
      id: post(7), pet_id: PET_ID, sitter_id: SITTER.id, posted_by: SITTER.id, visibility: "shared", media_id: media(7),
      caption: "Just now", caption_source: "fallback", task_log_id: null, created_at: new Date(Date.now() - 10 * 60_000).toISOString(),
    });
  }

  test("within 30 minutes the sitter picks both of you or only me", async ({ page }) => {
    const { db, calls } = await setup(page, SITTER);
    await freshPost(db);
    await page.goto(`/sitter/feed/${PET_ID}`);
    await app(page).getByTestId(`feed-card-${post(7)}`).click();
    await app(page).getByTestId("feed-viewer-delete").click();
    await expect(sheetBody(page)).toHaveText("Delete it for both of you, or only for you?");
    await expect(app(page).getByTestId("feed-delete-both")).toHaveText("Delete for both");
    await expect(app(page).getByTestId("feed-delete-me")).toHaveText("Delete for me only");

    await app(page).getByTestId("feed-delete-both").click();
    await expect(app(page).getByTestId("toast")).toContainText("Photo deleted for both");
    expect(calls).toEqual([{ id: post(7), scope: "everyone", by: SITTER.id }]);
    expect(db.feed_posts.some((p) => p.id === post(7))).toBe(false);
  });

  test("Delete for me only keeps the photo for the owner", async ({ page }) => {
    const { db, calls } = await setup(page, SITTER);
    await freshPost(db);
    await page.goto(`/sitter/feed/${PET_ID}`);
    await app(page).getByTestId(`feed-card-${post(7)}`).click();
    await app(page).getByTestId("feed-viewer-delete").click();
    await app(page).getByTestId("feed-delete-me").click();
    await expect(app(page).getByTestId(`feed-card-${post(7)}`)).toHaveCount(0);
    expect(calls).toEqual([{ id: post(7), scope: "me", by: SITTER.id }]);
    expect(db.feed_posts.some((p) => p.id === post(7))).toBe(true);
  });

  test("a photo only I can see is deleted for good", async ({ page }) => {
    const { db } = await setup(page, SITTER);
    db.feed_posts[1].visibility = "private";
    await page.goto(`/sitter/feed/${PET_ID}`);
    await app(page).getByTestId(`feed-card-${post(1)}`).click();
    await app(page).getByTestId("feed-viewer-delete").click();
    await expect(sheetBody(page)).toHaveText("This deletes the photo for good.");
    await app(page).getByTestId("feed-delete-confirm").click();
    await expect(app(page).getByTestId(`feed-card-${post(1)}`)).toHaveCount(0);
    expect(db.feed_posts.some((p) => p.id === post(1))).toBe(false);
  });

  test("Hide takes a photo out of the grid; Hidden brings it back and Unhide returns it", async ({ page }) => {
    const { db } = await setup(page, OWNER);
    await page.goto("/owner/feed");
    await app(page).getByTestId(`feed-card-${post(1)}`).click();
    await app(page).getByTestId("feed-viewer-hide").click();
    await expect(app(page).getByTestId("toast")).toContainText("Photo hidden");
    await expect(app(page).getByTestId(`feed-card-${post(1)}`)).toHaveCount(0);
    expect(db.feed_post_hidden).toMatchObject([{ post_id: post(1), user_id: OWNER.id, state: "hidden" }]);
    // The sitter's copy is untouched, and so is the post itself.
    expect(db.feed_posts.some((p) => p.id === post(1))).toBe(true);

    // The Hidden chip is there once something is hidden, after No tag.
    const chips = await app(page).locator("[data-testid^='feed-filter-']").evaluateAll((els) => els.map((e) => e.getAttribute("data-testid")));
    expect(chips.at(-1)).toBe("feed-filter-hidden");
    expect(chips.at(-2)).toBe("feed-filter-none");
    await app(page).getByTestId("feed-filter-hidden").click();
    await expect(app(page).getByTestId(`feed-card-${post(1)}`)).toBeVisible();
    await expect(app(page).getByTestId(`feed-card-${post(0)}`)).toHaveCount(0);
    await app(page).getByTestId(`feed-card-${post(1)}`).click();
    await expect(app(page).getByTestId("feed-viewer-hide")).toHaveText("Unhide");
    await app(page).getByTestId("feed-viewer-hide").click();
    expect(db.feed_post_hidden).toHaveLength(0);
    // Nothing hidden any more: the chip is gone and the grid is back.
    await expect(app(page).getByTestId("feed-filter-hidden")).toHaveCount(0);
    await expect(app(page).getByTestId(`feed-card-${post(1)}`)).toBeVisible();
  });

  test("a sitter hides a photo too", async ({ page }) => {
    const { db } = await setup(page, SITTER);
    await page.goto(`/sitter/feed/${PET_ID}`);
    await app(page).getByTestId(`feed-card-${post(0)}`).click();
    await app(page).getByTestId("feed-viewer-hide").click();
    await expect(app(page).getByTestId(`feed-card-${post(0)}`)).toHaveCount(0);
    expect(db.feed_post_hidden).toMatchObject([{ post_id: post(0), user_id: SITTER.id, state: "hidden" }]);
  });
});

test.describe("Feed layout and filters", () => {
  const id = (n: number) => `00000000-0000-4000-8000-00000000f20${n}`;
  const mid = (n: number) => `00000000-0000-4000-8000-00000000e20${n}`;
  // [tag, days ago, purpose]: today a meal, a meal, a walk, a nap, a plain photo; yesterday a mood, a potty, a sticker.
  const SEED: [string | null, number, string][] = [
    ["meal", 0, "feed"], ["meal", 0, "feed"], ["walk", 0, "feed"], ["nap", 0, "feed"], [null, 0, "feed"],
    ["mood", 1, "feed"], ["potty", 1, "feed"], [null, 1, "sticker"],
  ];

  async function seeded(page: Page) {
    await page.clock.setFixedTime(NOON_TORONTO);
    const { db } = await mockSupabase(page, [OWNER, SITTER], { now: NOON_TORONTO });
    db.pets.push({ id: PET_ID, owner_id: OWNER.id, species: "dog", name: "Max", breed: null, notes: null });
    SEED.forEach(([category, daysAgo, purpose], i) => {
      db.media.push({
        id: mid(i), pet_id: PET_ID, cloudinary_public_id: `goldito/${PET_ID}/${purpose}/g${i}`, resource_type: "image",
        purpose, width: 1200, height: 900, duration_s: null,
      });
      db.feed_posts.push({
        id: id(i), pet_id: PET_ID, sitter_id: SITTER.id, posted_by: SITTER.id, visibility: "shared", media_id: mid(i),
        caption: `Caption ${i}`, caption_source: "task", category, note: null, task_log_id: null,
        created_at: new Date(NOON_TORONTO.getTime() - daysAgo * 86_400_000 - i * 60_000).toISOString(),
      });
    });
    await signIn(page, OWNER);
    await app(page).getByRole("heading", { name: /^(Home|Today)$/ }).first().waitFor();
    await page.goto("/owner/feed");
    await app(page).getByTestId("feed-filters").waitFor();
    return db;
  }

  test("the newest photo takes 2 x 2 cells beside two small ones, the rest are three to a row, 8 px apart", async ({ page }) => {
    await seeded(page);
    const screen = app(page);
    const hero = await box(screen.getByTestId(`feed-card-${id(0)}`));
    const side1 = await box(screen.getByTestId(`feed-card-${id(1)}`));
    const side2 = await box(screen.getByTestId(`feed-card-${id(2)}`));
    const row = [await box(screen.getByTestId(`feed-card-${id(3)}`)), await box(screen.getByTestId(`feed-card-${id(4)}`))];

    expect(hero.width).toBeCloseTo(2 * side1.width + 8, 0);
    expect(hero.height).toBeCloseTo(hero.width, 0);
    expect(side1.width).toBeCloseTo(side1.height, 0);
    expect(side1.x - (hero.x + hero.width)).toBeCloseTo(8, 0); // the gap beside the big one
    expect(side2.y - (side1.y + side1.height)).toBeCloseTo(8, 0); // and between the two small ones
    expect(side1.y).toBeCloseTo(hero.y, 0);
    expect(side2.y + side2.height).toBeCloseTo(hero.y + hero.height, 0);
    // The next row: three across at most, same size as the small ones, 8 px apart, below the big one.
    expect(row[0].width).toBeCloseTo(side1.width, 0);
    expect(row[0].y - (hero.y + hero.height)).toBeCloseTo(8, 0);
    expect(row[1].x - (row[0].x + row[0].width)).toBeCloseTo(8, 0);
    expect(row[1].y).toBeCloseTo(row[0].y, 0);
    // Asking for a photo lives in the chat now, not here.
    await expect(screen.getByTestId("feed-request-photo")).toHaveCount(0);
  });

  test("a header per day with its count", async ({ page }) => {
    await seeded(page);
    const screen = app(page);
    const headers = await screen.locator("[data-testid^='feed-day-']").allInnerTexts();
    expect(headers).toEqual(["Today · Fri Oct 9\n5 photos", "Yesterday · Thu Oct 8\n3 photos"]);
  });

  test("the chips are All, Meals, Walks, Naps, Mood, Potty, and No tag last", async ({ page }) => {
    await seeded(page);
    const ids = await app(page).locator("[data-testid^='feed-filter-']").evaluateAll((els) => els.map((e) => e.getAttribute("data-testid")));
    expect(ids).toEqual(["feed-filter-all", "feed-filter-meal", "feed-filter-walk", "feed-filter-nap", "feed-filter-mood", "feed-filter-potty", "feed-filter-none"]);
    await expect(app(page).getByTestId("feed-filter-none")).toHaveText("No tag");
  });

  test("a chip shows only the photos with that tag; No tag shows the rest, stickers included", async ({ page }) => {
    await seeded(page);
    const screen = app(page);
    const shown = async () =>
      (await screen.locator("[data-testid^='feed-card-']").evaluateAll((els) => els.map((e) => e.getAttribute("data-testid")!.replace("feed-card-", "")))).sort();

    await screen.getByTestId("feed-filter-meal").click();
    expect(await shown()).toEqual([id(0), id(1)]);
    await screen.getByTestId("feed-filter-walk").click();
    expect(await shown()).toEqual([id(2)]);
    await screen.getByTestId("feed-filter-mood").click();
    expect(await shown()).toEqual([id(5)]);
    await screen.getByTestId("feed-filter-potty").click();
    expect(await shown()).toEqual([id(6)]);
    await screen.getByTestId("feed-filter-none").click();
    expect(await shown()).toEqual([id(4), id(7)]);
    await screen.getByTestId("feed-filter-all").click();
    expect(await shown()).toHaveLength(8);
  });

  test("a tag with no photos says so", async ({ page }) => {
    const db = await seeded(page);
    db.feed_posts.forEach((p) => {
      if (p.category === "mood") p.category = null;
    });
    await page.reload();
    await app(page).getByTestId("feed-filters").waitFor();
    await app(page).getByTestId("feed-filter-mood").click();
    await expect(app(page).getByText("No mood photos yet")).toBeVisible();
  });

  test("each photo carries its time, and its tag when it has one", async ({ page }) => {
    await seeded(page);
    // Newest first: 12:00 PM Toronto is "12:00".
    await expect(app(page).getByTestId(`feed-card-${id(0)}`)).toHaveAccessibleName("Meals at 12:00");
    await expect(app(page).getByTestId(`feed-card-${id(4)}`)).toHaveAccessibleName("Photo at 11:56");
  });

  test("an empty Feed says what will show", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    db.pets.push({ id: PET_ID, owner_id: OWNER.id, species: "dog", name: "Max", breed: null, notes: null });
    await signIn(page, OWNER);
    await app(page).getByRole("heading", { name: /^(Home|Today)$/ }).first().waitFor();
    await page.goto("/owner/feed");
    await expect(app(page).getByText("No photos yet")).toBeVisible();
    // The chips are there from the start, so the Feed looks like the design before there is a photo.
    await expect(app(page).getByTestId("feed-filters")).toBeVisible();
  });
});

test.describe("After the stay", () => {
  async function pastStay(page: Page) {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    caring(db, [{ id: PET_ID, name: "Max", species: "dog" }]);
    // The stay ended three days ago.
    for (const h of db.booking_handoffs) {
      Object.assign(h, {
        scheduled_at: new Date(Date.now() - (h.kind === "drop_off" ? 5 : 3) * 24 * HOUR).toISOString(),
        completed_at: new Date(Date.now() - (h.kind === "drop_off" ? 5 : 3) * 24 * HOUR).toISOString(),
      });
    }
    db.media.push({ id: media(0), pet_id: PET_ID, cloudinary_public_id: `goldito/${PET_ID}/feed/old`, resource_type: "image", purpose: "feed" });
    db.feed_posts.push({
      id: post(0), pet_id: PET_ID, sitter_id: SITTER.id, posted_by: SITTER.id, visibility: "shared", media_id: media(0),
      caption: "Day one", caption_source: "fallback", task_log_id: null, created_at: new Date(Date.now() - 4 * 24 * HOUR).toISOString(),
    });
    await mockFeedApi(page, db);
    await signIn(page, SITTER);
    await app(page).getByRole("heading", { name: /^(Home|Today)$/ }).first().waitFor();
    return db;
  }

  test("with no pet in care the Feed opens on the pet of the stay that is over, and its photos open", async ({ page }) => {
    await pastStay(page);
    await page.goto("/sitter/feed");
    await expect(app(page).getByTestId("sitter-pet-feed")).toBeVisible();
    await expect(app(page).getByTestId(`feed-card-${post(0)}`)).toBeVisible();
    // One pet only: there is nothing to pick between, so no pet chip.
    await expect(app(page).getByTestId("feed-pet")).toHaveCount(0);
  });
});

test.describe("Notification center", () => {
  const n = (i: number) => `00000000-0000-4000-8000-00000000a00${i}`;

  test("unread badge, tap marks read and opens Feed, mark all as read", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    db.pets.push({ id: PET_ID, owner_id: OWNER.id, species: "dog", name: "Max", breed: null, notes: null });
    for (const i of [0, 1]) {
      db.notifications.push({
        id: n(i),
        user_id: OWNER.id,
        type: "feed_post",
        title: `New photo of Max 📸 ${i}`,
        body: null,
        pet_id: PET_ID,
        booking_id: null,
        ref_id: null,
        read_at: null,
        created_at: new Date(Date.now() - i * 60_000).toISOString(),
      });
    }
    await signIn(page, OWNER);
    await app(page).getByRole("heading", { name: /^(Home|Today)$/ }).first().waitFor();

    await expect(app(page).getByTestId("notification-badge").first()).toHaveText("2");
    await app(page).locator("[data-testid='notification-bell']:visible").click();
    await expect(app(page).getByTestId("notifications-center")).toBeVisible();

    await app(page).getByTestId(`notification-${n(0)}`).click();
    await expect(page).toHaveURL(/\/owner\/feed/);
    expect(db.notifications.find((x) => x.id === n(0))?.read_at).toBeTruthy();
    await expect(app(page).getByTestId("notification-badge").first()).toHaveText("1");

    await app(page).locator("[data-testid='notification-bell']:visible").click();
    await app(page).locator("[data-testid='mark-all-read']:visible").click();
    await expect(app(page).getByTestId("notification-badge")).toHaveCount(0);
    expect(db.notifications.every((x) => x.read_at)).toBe(true);
  });

  test("a sitter's feed_post notice opens that pet's feed", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    caring(db, [{ id: PET_ID, name: "Max", species: "dog" }]);
    db.notifications.push({
      id: n(7),
      user_id: SITTER.id,
      type: "feed_post",
      title: "Robert shared a photo of Max 📸",
      body: null,
      pet_id: PET_ID,
      booking_id: null,
      ref_id: null,
      read_at: null,
      created_at: new Date().toISOString(),
    });
    await signIn(page, SITTER);
    await app(page).getByRole("heading", { name: /^(Home|Today)$/ }).first().waitFor();
    await app(page).locator("[data-testid='notification-bell']:visible").click();
    await app(page).getByTestId(`notification-${n(7)}`).click();
    await expect(page).toHaveURL(new RegExp(`/sitter/feed\\?pet=${PET_ID}`));
    await expect(app(page).getByTestId("sitter-pet-feed")).toBeVisible();
  });

  async function seedTwo(page: Page) {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    db.pets.push({ id: PET_ID, owner_id: OWNER.id, species: "dog", name: "Max", breed: null, notes: null });
    for (const i of [0, 1]) {
      db.notifications.push({
        id: n(i),
        user_id: OWNER.id,
        type: "feed_post",
        title: `New photo of Max 📸 ${i}`,
        body: null,
        pet_id: PET_ID,
        booking_id: null,
        ref_id: null,
        read_at: null,
        created_at: new Date(Date.now() - i * 60_000).toISOString(),
      });
    }
    await signIn(page, OWNER);
    await app(page).getByRole("heading", { name: /^(Home|Today)$/ }).first().waitFor();
    await app(page).locator("[data-testid='notification-bell']:visible").click();
    await app(page).getByTestId("notifications-center").waitFor();
    return db;
  }

  /** Drag a row to the left by `share` of its own width, like a finger. */
  async function swipe(page: Page, id: string, share: number) {
    const row = await box(app(page).getByTestId(`notification-swipe-${id}`));
    const y = row.y + row.height / 2;
    const from = { x: row.x + row.width - 12, y };
    await drag(page, from, { x: from.x - row.width * share, y }, 14);
  }

  test("swipe a notification past 60% to delete it; a shorter swipe springs back", async ({ page }) => {
    const db = await seedTwo(page);
    const screen = app(page);

    await swipe(page, n(0), 0.35);
    await expect(screen.getByTestId(`notification-${n(0)}`)).toBeVisible();
    expect(db.notifications).toHaveLength(2);

    await swipe(page, n(0), 0.8);
    await expect(screen.getByTestId(`notification-${n(0)}`)).toHaveCount(0);
    await expect(screen.getByTestId(`notification-${n(1)}`)).toBeVisible();
    expect(db.notifications.map((x) => x.id)).toEqual([n(1)]);
    // On Home the unread badge counts what is left.
    await page.goto("/owner");
    await screen.getByRole("heading", { name: /^(Home|Today)$/ }).first().waitFor();
    await expect(screen.locator("[data-testid='notification-badge']:visible").first()).toHaveText("1");
  });

  test("rows are rounded cards; the red Delete layer is hidden at rest and has the same rounded shape while pulled", async ({ page }) => {
    await seedTwo(page);
    const screen = app(page);
    const radius = (testId: string) =>
      screen.getByTestId(testId).evaluate((el) => getComputedStyle(el).borderTopLeftRadius);

    // Every notice is a rounded card…
    expect(parseFloat(await radius(`notification-${n(0)}`))).toBeGreaterThan(0);
    // …and the layer under it is invisible until the card is pulled aside.
    const behind = `notification-swipe-${n(0)}-behind`;
    expect(await screen.getByTestId(behind).evaluate((el) => getComputedStyle(el).opacity)).toBe("0");

    const row = await box(screen.getByTestId(`notification-swipe-${n(0)}`));
    const y = row.y + row.height / 2;
    await page.mouse.move(row.x + row.width - 12, y);
    await page.mouse.down();
    await page.mouse.move(row.x + row.width - 12 - row.width * 0.3, y, { steps: 10 });
    expect(Number(await screen.getByTestId(behind).evaluate((el) => getComputedStyle(el).opacity))).toBeGreaterThan(0.5);
    expect(await radius(behind)).toBe(await radius(`notification-${n(0)}`)); // same corner shape
    await page.mouse.up();
  });

  test("a tap still opens the notice (swipe handling doesn't swallow it)", async ({ page }) => {
    await seedTwo(page);
    await app(page).getByTestId(`notification-${n(0)}`).click();
    await expect(page).toHaveURL(/\/owner\/feed/);
  });

  test("Clear all asks first, then empties the list", async ({ page }) => {
    const db = await seedTwo(page);
    const screen = app(page);
    await screen.getByTestId("clear-all").click();
    await screen.getByTestId("clear-all-sheet-close").click();
    expect(db.notifications).toHaveLength(2);

    await screen.getByTestId("clear-all").click();
    await expect(screen.getByTestId("clear-all-confirm")).toHaveText("Clear 2 notifications");
    await screen.getByTestId("clear-all-confirm").click();
    await expect(screen.getByText("You're all caught up.")).toBeVisible();
    expect(db.notifications).toHaveLength(0);
  });

  test("day cards: notices grouped by day, no emoji, a day's check-ins of one pet fold into one row (Oct 27)", async ({ page }) => {
    await page.clock.setFixedTime(NOON_TORONTO);
    const { db } = await mockSupabase(page, [OWNER, SITTER], { now: NOON_TORONTO });
    db.pets.push({ id: PET_ID, owner_id: OWNER.id, species: "dog", name: "Max", breed: null, notes: null });
    const at = (min: number) => new Date(NOON_TORONTO.getTime() - min * 60_000).toISOString();
    const notice = (id: string, type: string, title: string, min: number, read = false) =>
      db.notifications.push({ id, user_id: OWNER.id, type, title, body: null, pet_id: PET_ID, booking_id: null, ref_id: null, read_at: read ? at(min) : null, created_at: at(min) });
    notice("n-meal", "care_checkin", "Max ate everything 🍽️", 3);
    notice("n-walk", "care_checkin", "Max had a 20-minute walk 🦮", 2);
    notice("n-potty", "care_checkin", "Potty update for Max: normal 💩", 1);
    notice("n-report", "report_sent", "Chloe sent Max's daily page 📔", 24 * 60, true);
    await signIn(page, OWNER);
    await app(page).getByRole("heading", { name: /^(Home|Today)$/ }).first().waitFor();
    await page.goto("/owner/notifications");
    const screen = app(page);

    const fold = screen.locator("[data-testid^='notification-fold-']");
    await expect(fold).toContainText("3 check-ins for Max");
    await expect(fold).toContainText("Meal, walk 20 min, potty");
    await expect(screen.getByTestId("notification-n-meal")).toHaveCount(0);
    await fold.click();
    await expect(screen.getByTestId("notification-n-meal")).toHaveText(/Max ate everything/);
    await expect(screen.getByTestId("notification-n-meal")).not.toContainText("🍽");

    const report = screen.getByTestId("notification-n-report");
    await expect(report).toContainText("Read");
    await expect(report).not.toContainText("📔");
    // Day labels are set in capitals, so match them case-blind.
    await expect(screen.getByText(/^yesterday$/i)).toBeVisible();
    await expect(screen.getByTestId("notifications-center").getByText(/^today$/i)).toBeVisible();
  });

  test("a notice 1h old is under Today and one 26h old under Yesterday, each with its day of the stay", async ({ page }) => {
    await page.clock.setFixedTime(NOON_TORONTO);
    const { db } = await mockSupabase(page, [OWNER, SITTER], { now: NOON_TORONTO });
    // Dropped off yesterday at noon, picked up in two days: four days with Chloe.
    caring(db, [{ id: PET_ID, name: "Max", species: "dog" }], NOON_TORONTO);
    const at = (hours: number) => new Date(NOON_TORONTO.getTime() - hours * HOUR).toISOString();
    for (const [id, hours] of [["n-1h", 1], ["n-26h", 26]] as const) {
      db.notifications.push({ id, user_id: OWNER.id, type: "feed_post", title: `New photo of Max ${id}`, body: null, pet_id: PET_ID, booking_id: null, ref_id: null, read_at: null, created_at: at(hours) });
    }
    await signIn(page, OWNER);
    await app(page).getByRole("heading", { name: /^(Home|Today)$/ }).first().waitFor();
    await page.goto("/owner/notifications");
    const screen = app(page);

    const today = screen.getByTestId(`notice-day-${TODAY_TORONTO}`);
    await expect(today).toContainText(/today · day 2 of 4 with chloe/i);
    await expect(today.getByTestId("notification-n-1h")).toContainText("1h ago");
    const yesterday = screen.locator("[data-testid^='notice-day-']").nth(1);
    await expect(yesterday).toContainText(/yesterday/i);
    await expect(yesterday.getByTestId("notification-n-26h")).toBeVisible();
    // The older card names the day, so its rows give the time of day instead of "26h ago".
    await expect(yesterday.getByTestId("notification-n-26h")).toContainText("10:00 AM");
  });

  test("empty state", async ({ page }) => {
    await mockSupabase(page, [OWNER, SITTER]);
    await signIn(page, OWNER);
    await app(page).getByRole("heading", { name: /^(Home|Today)$/ }).first().waitFor();
    await app(page).locator("[data-testid='notification-bell']:visible").click();
    await expect(app(page).getByText("You're all caught up.")).toBeVisible();
  });
});

// The pet dropdown, the Photos / Diary switch, the time badge, and the viewer's swipe, edge taps and zoom (#345).
test.describe("Feed pet dropdown and switch", () => {
  const REX = "00000000-0000-4000-8000-0000000000cc";
  const MOCHI_ID = "00000000-0000-4000-8000-0000000000bb";

  /** A stay of `petId` that ended three days ago. */
  function pastStayOf(db: MockDb, petId: string, name: string) {
    db.pets.push({ id: petId, owner_id: OWNER.id, species: "dog", name, breed: null, notes: null });
    db.bookings.push({ id: "b-past", owner_id: OWNER.id, sitter_id: SITTER.id, status: "confirmed", service_type: "boarding", meet_greet_status: "not_needed", created_at: "2026-10-01T10:00:00Z" });
    db.booking_pets.push({ booking_id: "b-past", pet_id: petId });
    for (const [kind, days] of [["drop_off", 5], ["pick_up", 3]] as const) {
      const at = new Date(Date.now() - days * 24 * HOUR).toISOString();
      db.booking_handoffs.push({ id: `b-past-${kind}`, booking_id: "b-past", kind, scheduled_at: at, location_type: "sitter_home", location_note: null, within_sitter_hours: true, status: "agreed", proposed_by: OWNER.id, completed_at: at, created_at: "2026-10-01T10:00:00Z" });
    }
  }

  function photo(db: MockDb, id: string, petId: string, minutesAgo = 120) {
    db.media.push({ id: `m-${id}`, pet_id: petId, cloudinary_public_id: `goldito/${petId}/feed/${id}`, resource_type: "image", purpose: "feed" });
    db.feed_posts.push({
      id, pet_id: petId, sitter_id: SITTER.id, posted_by: SITTER.id, visibility: "shared", media_id: `m-${id}`,
      caption: id, caption_source: "fallback", task_log_id: null, created_at: new Date(Date.now() - minutesAgo * 60_000).toISOString(),
    });
  }

  test("the owner opens on All pets with a face on each photo; the dropdown lists only their own pets, and picking one shows that pet's photos", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    db.pets.push(
      { id: PET_ID, owner_id: OWNER.id, species: "dog", name: "Max", breed: null, notes: null, created_at: "2026-01-01T00:00:00Z" },
      { id: MOCHI_ID, owner_id: OWNER.id, species: "cat", name: "Mochi", breed: null, notes: null, created_at: "2026-01-02T00:00:00Z" },
      { id: REX, owner_id: SITTER.id, species: "dog", name: "Rex", breed: null, notes: null, created_at: "2026-01-03T00:00:00Z" },
    );
    photo(db, "max-1", PET_ID);
    photo(db, "mochi-1", MOCHI_ID);
    await signIn(page, OWNER);
    await app(page).getByRole("heading", { name: /^(Home|Today)$/ }).first().waitFor();
    await page.goto("/owner/feed");
    await expect(app(page).getByTestId("feed-pet")).toContainText("All pets");
    await expect(app(page).getByTestId("feed-card-max-1")).toBeVisible();
    await expect(app(page).getByTestId("feed-card-mochi-1")).toBeVisible();
    // Several pets together: each photo says whose it is.
    await expect(app(page).getByTestId("feed-face-max-1")).toBeVisible();
    await expect(app(page).getByTestId("feed-face-mochi-1")).toBeVisible();

    await app(page).getByTestId("feed-pet").click();
    await expect(app(page).getByTestId("feed-pet-all")).toBeVisible();
    await expect(app(page).getByTestId(`feed-pet-${PET_ID}`)).toBeVisible();
    await expect(app(page).getByTestId(`feed-pet-${MOCHI_ID}`)).toBeVisible();
    await expect(app(page).getByTestId(`feed-pet-${REX}`)).toHaveCount(0); // someone else's pet
    await expect(app(page).getByTestId("feed-pet-line")).toHaveCount(0);
    await app(page).getByTestId(`feed-pet-${MOCHI_ID}`).click();
    await expect(app(page).getByTestId("feed-pet")).toContainText("Mochi");
    await expect(app(page).getByTestId("feed-card-mochi-1")).toBeVisible();
    await expect(app(page).getByTestId("feed-card-max-1")).toHaveCount(0);
    // One pet on screen: no face on the photo.
    await expect(app(page).getByTestId("feed-face-mochi-1")).toHaveCount(0);

    await app(page).getByTestId("feed-pet").click();
    await app(page).getByTestId("feed-pet-all").click();
    await expect(app(page).getByTestId("feed-card-max-1")).toBeVisible();
  });

  test("an owner with one pet has no pet chip and no faces", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    db.pets.push({ id: PET_ID, owner_id: OWNER.id, species: "dog", name: "Max", breed: null, notes: null });
    photo(db, "max-1", PET_ID);
    await signIn(page, OWNER);
    await app(page).getByRole("heading", { name: /^(Home|Today)$/ }).first().waitFor();
    await page.goto("/owner/feed");
    await expect(app(page).getByTestId("feed-card-max-1")).toBeVisible();
    await expect(app(page).getByTestId("feed-pet")).toHaveCount(0);
    await expect(app(page).getByTestId("feed-face-max-1")).toHaveCount(0);
  });

  test("the pet chip sits at the right end of the Photos / Diary row, and goes with the Diary tab", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    db.pets.push(
      { id: PET_ID, owner_id: OWNER.id, species: "dog", name: "Max", breed: null, notes: null, created_at: "2026-01-01T00:00:00Z" },
      { id: MOCHI_ID, owner_id: OWNER.id, species: "cat", name: "Mochi", breed: null, notes: null, created_at: "2026-01-02T00:00:00Z" },
    );
    photo(db, "max-1", PET_ID);
    await page.route("**/api/ai/report-chips", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ summary: { tasks_done: 0, tasks_missed: 0, checkins: 0 }, chips: [], photos: [] }) }),
    );
    await signIn(page, OWNER);
    await app(page).getByRole("heading", { name: /^(Home|Today)$/ }).first().waitFor();
    await page.goto("/owner/feed");
    const tabs = await box(app(page).getByTestId("feed-view"));
    const diary = await box(app(page).getByTestId("feed-view-diary"));
    const chip = await box(app(page).getByTestId("feed-pet"));
    expect(chip.x).toBeGreaterThan(diary.x + diary.width);
    const middle = chip.y + chip.height / 2;
    expect(middle).toBeGreaterThanOrEqual(tabs.y);
    expect(middle).toBeLessThanOrEqual(tabs.y + tabs.height + 8);
    // The filter row no longer starts with it.
    expect((await box(app(page).getByTestId("feed-filters"))).y).toBeGreaterThan(chip.y + chip.height - 1);
    await app(page).getByTestId("feed-view-diary").click();
    await expect(app(page).getByTestId("feed-pet")).toHaveCount(0);
  });

  test("one more tap on an open photo hides the details and the buttons; another brings them back", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    db.pets.push({ id: PET_ID, owner_id: OWNER.id, species: "dog", name: "Max", breed: null, notes: null });
    photo(db, "max-1", PET_ID);
    await signIn(page, OWNER);
    await app(page).getByRole("heading", { name: /^(Home|Today)$/ }).first().waitFor();
    await page.goto("/owner/feed");
    await app(page).getByTestId("feed-card-max-1").click();
    await expect(app(page).getByTestId("feed-viewer-info")).toBeVisible();
    await expect(app(page).getByTestId("feed-viewer-close")).toBeVisible();
    await app(page).getByTestId("feed-viewer-media").click();
    await expect(app(page).getByTestId("feed-viewer-info")).toHaveCount(0);
    await expect(app(page).getByTestId("feed-viewer-close")).toHaveCount(0);
    await expect(app(page).getByTestId("feed-viewer-zoom")).toBeVisible();
    await app(page).getByTestId("feed-viewer-media").click();
    await expect(app(page).getByTestId("feed-viewer-info")).toBeVisible();
    await expect(app(page).getByTestId("feed-viewer-close")).toBeVisible();
  });

  test("Make a sticker, or press and hold the photo, cuts the pet out right there and saves it; a clip has neither", async ({ page }) => {
    // MediaPipe is replaced by test hooks: a fixed box and an elliptic mask; the sticker itself is drawn by the app.
    await page.addInitScript(() => {
      (window as unknown as { __goldiVision: unknown }).__goldiVision = {
        loadFrames: () => {
          const frame = document.createElement("canvas");
          frame.width = 200;
          frame.height = 150;
          const ctx = frame.getContext("2d")!;
          ctx.fillStyle = "#888";
          ctx.fillRect(0, 0, 200, 150);
          return [frame];
        },
        detectPets: () => [{ x: 0.2, y: 0.2, w: 0.5, h: 0.6, label: "dog", score: 0.9 }],
        segmentAt: (_frame: HTMLCanvasElement, point: { x: number; y: number }) => {
          const width = 200;
          const height = 150;
          const data = new Float32Array(width * height);
          for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
              const dx = (x / width - point.x) / 0.15;
              const dy = (y / height - point.y) / 0.2;
              data[y * width + x] = dx * dx + dy * dy <= 1 ? 1 : 0;
            }
          }
          return { width, height, data };
        },
      };
    });
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    db.pets.push({ id: PET_ID, owner_id: OWNER.id, species: "dog", name: "Max", breed: null, notes: null });
    photo(db, "max-1", PET_ID);
    db.media.push({ id: "m-clip", pet_id: PET_ID, cloudinary_public_id: `goldito/${PET_ID}/feed/clip`, resource_type: "video", purpose: "feed" });
    db.feed_posts.push({
      id: "clip", pet_id: PET_ID, sitter_id: SITTER.id, posted_by: SITTER.id, visibility: "shared", media_id: "m-clip",
      caption: "clip", caption_source: "fallback", task_log_id: null, created_at: new Date(Date.now() - 60 * 60_000).toISOString(),
    });
    await mockUpload(page, db, PET_ID);
    await signIn(page, OWNER);
    await app(page).getByRole("heading", { name: /^(Home|Today)$/ }).first().waitFor();
    await page.goto("/owner/feed");
    await app(page).getByTestId("feed-card-clip").click();
    await expect(app(page).getByTestId("feed-viewer-close")).toBeVisible();
    await expect(app(page).getByTestId("feed-viewer-sticker")).toHaveCount(0);
    await app(page).getByTestId("feed-viewer-close").click();

    // The button: it works in place (no new screen), the viewer closes and a toast says it is saved.
    await app(page).getByTestId("feed-card-max-1").click();
    await app(page).getByTestId("feed-viewer-sticker").click();
    await expect(app(page).getByTestId("toast")).toContainText("Paw-fect!");
    await expect(app(page).getByTestId("feed-viewer")).toHaveCount(0);
    expect(db.pet_stickers).toHaveLength(1);
    expect(db.pet_stickers[0]).toMatchObject({ pet_id: PET_ID, created_by: OWNER.id });
    await expect(page).toHaveURL(/\/owner\/feed$/);

    // Press and hold on the photo does the same.
    await app(page).getByTestId("feed-card-max-1").click();
    const media = await box(app(page).getByTestId("feed-viewer-media"));
    await page.mouse.move(media.x + media.width / 2, media.y + media.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(800);
    await page.mouse.up();
    await expect.poll(() => db.pet_stickers.length).toBe(2);
  });

  test("a sitter opens on All pets in care; the dropdown lists All pets, the pets in care, a line, then the past stays", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    caring(db, [{ id: PET_ID, name: "Max", species: "dog" }, { id: MOCHI_ID, name: "Mochi", species: "cat" }]);
    pastStayOf(db, REX, "Rex");
    photo(db, "max-1", PET_ID);
    photo(db, "mochi-1", MOCHI_ID);
    photo(db, "rex-1", REX);
    await signIn(page, SITTER);
    await app(page).getByRole("heading", { name: /^(Home|Today)$/ }).first().waitFor();
    await page.goto("/sitter/feed");
    // The pets in care together, a face on each photo; the past stay is not mixed in.
    await expect(app(page).getByTestId("feed-pet")).toContainText("All pets");
    await expect(app(page).getByTestId("feed-card-max-1")).toBeVisible();
    await expect(app(page).getByTestId("feed-card-mochi-1")).toBeVisible();
    await expect(app(page).getByTestId("feed-face-max-1")).toBeVisible();
    await expect(app(page).getByTestId("feed-card-rex-1")).toHaveCount(0);

    await app(page).getByTestId("feed-pet").click();
    // All pets, then the pets in care, then the past stay.
    const top = async (id: string) => (await box(app(page).getByTestId(id))).y;
    expect(await top("feed-pet-all")).toBeLessThan(await top(`feed-pet-${PET_ID}`));
    expect(await top(`feed-pet-${PET_ID}`)).toBeLessThan(await top(`feed-pet-${MOCHI_ID}`));
    expect(await top(`feed-pet-${MOCHI_ID}`)).toBeLessThan(await top(`feed-pet-${REX}`));
    await expect(app(page).getByTestId(`feed-pet-${PET_ID}`)).toContainText("In care");
    await expect(app(page).getByTestId(`feed-pet-${REX}`)).toContainText("Past stay");
    // The one line sits between the groups (not under All pets) and is not a choice.
    await expect(app(page).getByTestId("feed-pet-line")).toHaveCount(1);
    const line = await box(app(page).getByTestId("feed-pet-line"));
    expect((await box(app(page).getByTestId(`feed-pet-${MOCHI_ID}`))).y).toBeLessThan(line.y);
    expect((await box(app(page).getByTestId(`feed-pet-${REX}`))).y).toBeGreaterThan(line.y);

    await app(page).getByTestId(`feed-pet-${REX}`).click();
    await expect(app(page).getByTestId("feed-pet")).toContainText("Rex");
    await expect(app(page).getByTestId("feed-card-rex-1")).toBeVisible();
    await expect(app(page).getByTestId("feed-card-max-1")).toHaveCount(0);
  });

  test("a sitter with one pet in care opens on it and has no All pets", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    caring(db, [{ id: PET_ID, name: "Max", species: "dog" }]);
    pastStayOf(db, REX, "Rex");
    photo(db, "max-1", PET_ID);
    photo(db, "rex-1", REX);
    await signIn(page, SITTER);
    await app(page).getByRole("heading", { name: /^(Home|Today)$/ }).first().waitFor();
    await page.goto("/sitter/feed");
    await expect(app(page).getByTestId("feed-pet")).toContainText("Max");
    await expect(app(page).getByTestId("feed-card-max-1")).toBeVisible();
    await expect(app(page).getByTestId("feed-face-max-1")).toHaveCount(0);
    await app(page).getByTestId("feed-pet").click();
    await expect(app(page).getByTestId("feed-pet-all")).toHaveCount(0);
    await expect(app(page).getByTestId(`feed-pet-${REX}`)).toContainText("Past stay");
  });

  test("Photos / Diary is a switch on both sides, the sitter's included", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    caring(db, [{ id: PET_ID, name: "Max", species: "dog" }]);
    photo(db, "max-1", PET_ID);
    await page.route("**/api/ai/report-chips", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ summary: { tasks_done: 0, tasks_missed: 0, checkins: 0 }, chips: [], photos: [] }) }),
    );
    await signIn(page, SITTER);
    await app(page).getByRole("heading", { name: /^(Home|Today)$/ }).first().waitFor();
    await page.goto("/sitter/feed");
    await expect(app(page).getByTestId("feed-view-photos")).toHaveAttribute("aria-selected", "true");
    await expect(app(page).getByTestId("feed-card-max-1")).toBeVisible();
    await app(page).getByTestId("feed-view-diary").click();
    await expect(app(page).getByTestId("feed-view-diary")).toHaveAttribute("aria-selected", "true");
    await expect(app(page).getByTestId("sitter-diary-view-book")).toBeVisible();
    await expect(app(page).getByTestId("feed-card-max-1")).toHaveCount(0);
    await app(page).getByTestId("feed-view-photos").click();
    await expect(app(page).getByTestId("feed-card-max-1")).toBeVisible();
  });

  test("the time of a photo with no tag sits in the middle of its pill", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    caring(db, [{ id: PET_ID, name: "Max", species: "dog" }]);
    photo(db, "plain-1", PET_ID);
    photo(db, "plain-2", PET_ID, 130);
    await signIn(page, SITTER);
    await app(page).getByRole("heading", { name: /^(Home|Today)$/ }).first().waitFor();
    await page.goto("/sitter/feed");
    for (const id of ["plain-1", "plain-2"]) {
      const pill = await box(app(page).getByTestId(`feed-badge-${id}`));
      const time = await box(app(page).getByTestId(`feed-badge-time-${id}`));
      expect(time.x + time.width / 2).toBeCloseTo(pill.x + pill.width / 2, 0);
      expect(time.y + time.height / 2).toBeCloseTo(pill.y + pill.height / 2, 0);
    }
  });

  test("the viewer turns the page with a swipe or a tap on the left or right edge, with no arrow buttons", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    caring(db, [{ id: PET_ID, name: "Max", species: "dog" }]);
    photo(db, "v-1", PET_ID, 10);
    photo(db, "v-2", PET_ID, 20);
    photo(db, "v-3", PET_ID, 30);
    await signIn(page, SITTER);
    await app(page).getByRole("heading", { name: /^(Home|Today)$/ }).first().waitFor();
    await page.goto("/sitter/feed");
    await app(page).getByTestId("feed-card-v-2").click();
    await expect(app(page).getByTestId("feed-viewer-page-v-2")).toBeVisible();
    // No next arrow; the edges are invisible strips (the ‹ at the top left is the way back).
    await expect(app(page).getByText("›")).toHaveCount(0);

    await app(page).getByTestId("feed-viewer-next").click();
    await expect(app(page).getByTestId("feed-viewer-page-v-3")).toBeVisible();
    await expect(app(page).getByTestId("feed-viewer-next")).toHaveCount(0);
    await app(page).getByTestId("feed-viewer-prev").click();
    await expect(app(page).getByTestId("feed-viewer-page-v-2")).toBeVisible();

    // A swipe to the left shows the next photo, to the right the one before.
    const root = await box(app(page).getByTestId("feed-viewer-media"));
    const y = root.y + root.height / 2;
    await drag(page, { x: root.x + root.width * 0.7, y }, { x: root.x + root.width * 0.3, y }, 10);
    await expect(app(page).getByTestId("feed-viewer-page-v-3")).toBeVisible();
    await drag(page, { x: root.x + root.width * 0.3, y }, { x: root.x + root.width * 0.7, y }, 10);
    await expect(app(page).getByTestId("feed-viewer-page-v-2")).toBeVisible();
  });

  test("a photo zooms with a pinch (ctrl + wheel on the desktop); while zoomed the edges and a swipe leave the page alone, and it resets on the next photo", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    caring(db, [{ id: PET_ID, name: "Max", species: "dog" }]);
    photo(db, "z-1", PET_ID, 10);
    photo(db, "z-2", PET_ID, 20);
    await signIn(page, SITTER);
    await app(page).getByRole("heading", { name: /^(Home|Today)$/ }).first().waitFor();
    await page.goto("/sitter/feed");
    await app(page).getByTestId("feed-card-z-1").click();
    const layer = app(page).getByTestId("feed-viewer-zoom");
    const scale = async () => layer.evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).a);
    expect(await scale()).toBeCloseTo(1, 2);

    await layer.dispatchEvent("wheel", { deltaY: -120, ctrlKey: true });
    await expect.poll(scale).toBeGreaterThan(1.5);
    // Zoomed: no edge strips, a swipe does not turn the page.
    await expect(app(page).getByTestId("feed-viewer-next")).toHaveCount(0);
    const media = await box(app(page).getByTestId("feed-viewer-media"));
    const y = media.y + media.height / 2;
    await drag(page, { x: media.x + media.width * 0.7, y }, { x: media.x + media.width * 0.3, y }, 10);
    await expect(app(page).getByTestId("feed-viewer-page-z-1")).toBeVisible();

    // Back out: the edges return and the page can turn.
    await layer.dispatchEvent("wheel", { deltaY: 400, ctrlKey: true });
    await expect.poll(scale).toBeCloseTo(1, 1);
    await app(page).getByTestId("feed-viewer-next").click();
    await expect(app(page).getByTestId("feed-viewer-page-z-2")).toBeVisible();
    expect(await app(page).getByTestId("feed-viewer-zoom").evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).a)).toBeCloseTo(1, 2);
  });

  test("the Hidden chip is not there while nothing is hidden", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    caring(db, [{ id: PET_ID, name: "Max", species: "dog" }]);
    photo(db, "h-1", PET_ID);
    await signIn(page, SITTER);
    await app(page).getByRole("heading", { name: /^(Home|Today)$/ }).first().waitFor();
    await page.goto("/sitter/feed");
    await app(page).getByTestId("feed-filters").waitFor();
    await expect(app(page).getByTestId("feed-filter-hidden")).toHaveCount(0);
  });
});

// Editing a photo (#345): tags (several), the day and time it is from, the memo; and the dropdown that drops from its button.
test.describe("Edit a photo", () => {
  const ids = (n: number) => `00000000-0000-4000-8000-00000000f30${n}`;
  const mids = (n: number) => `00000000-0000-4000-8000-00000000e30${n}`;

  async function seeded(page: Page, user: MockUser) {
    await page.clock.setFixedTime(NOON_TORONTO);
    const { db } = await mockSupabase(page, [OWNER, SITTER], { now: NOON_TORONTO });
    caring(db, [{ id: PET_ID, name: "Max", species: "dog" }], NOON_TORONTO);
    [["walk", 60, SITTER.id], [null, 120, SITTER.id], [null, 180, OWNER.id]].forEach(([category, minutes, by], i) => {
      db.media.push({ id: mids(i), pet_id: PET_ID, cloudinary_public_id: `goldito/${PET_ID}/feed/e${i}`, resource_type: "image", purpose: "feed" });
      db.feed_posts.push({
        id: ids(i), pet_id: PET_ID, sitter_id: by === SITTER.id ? SITTER.id : null, posted_by: by, visibility: "shared", media_id: mids(i),
        caption: `c${i}`, caption_source: "fallback", category, tags: category ? [category] : [], note: i === 0 ? "Sunny walk" : null, task_log_id: null,
        created_at: new Date(NOON_TORONTO.getTime() - (minutes as number) * 60_000).toISOString(),
        taken_at: new Date(NOON_TORONTO.getTime() - (minutes as number) * 60_000).toISOString(),
      });
    });
    await signIn(page, user);
    await app(page).getByRole("heading", { name: /^(Home|Today)$/ }).first().waitFor();
    await page.goto(user === SITTER ? "/sitter/feed" : "/owner/feed");
    await app(page).getByTestId("feed-filters").waitFor();
    return db;
  }

  test("the author edits the tags (several), the memo, the day and the time; the Feed and the detail follow", async ({ page }) => {
    const db = await seeded(page, SITTER);
    const screen = app(page);
    await screen.getByTestId(`feed-card-${ids(0)}`).click();
    await expect(screen.getByTestId("feed-viewer-edit")).toContainText("Edit");
    await screen.getByTestId("feed-viewer-edit").click();
    await expect(screen.getByTestId("feed-edit-sheet")).toBeVisible();
    // The photo's own tag is on; Potty goes on too, so it is both a walk and a potty.
    await expect(screen.getByTestId("feed-edit-tag-walk")).toHaveAttribute("aria-checked", "true");
    await expect(screen.getByTestId("feed-edit-tag-potty")).toHaveAttribute("aria-checked", "false");
    await screen.getByTestId("feed-edit-tag-potty").click();
    await screen.getByTestId("feed-edit-note").fill("Walk, then a potty break");
    // The time: 9:30 AM.
    await screen.getByTestId("feed-edit-time").click();
    await screen.getByTestId("time-hour-9").click();
    await screen.getByTestId("time-min-30").click();
    await screen.getByTestId("time-ampm-am").click();
    await screen.getByTestId("feed-edit-time-picker-set").click();
    await expect(screen.getByTestId("feed-edit-time")).toContainText("9:30 AM");
    // The day: yesterday.
    await screen.getByTestId("feed-edit-date").click();
    await screen.getByTestId("feed-edit-day-2026-10-08").click();
    await expect(screen.getByTestId("feed-edit-date")).toContainText("Oct 8, 2026");
    await screen.getByTestId("feed-edit-save").click();
    await expect(screen.getByTestId("toast")).toContainText("Photo updated");

    const row = db.feed_posts.find((p) => p.id === ids(0))!;
    expect(row).toMatchObject({ tags: ["potty", "walk"], note: "Walk, then a potty break" });
    expect(String(row.taken_at)).toBe("2026-10-08T13:30:00.000Z"); // 9:30 AM Toronto, a day back
    expect(row.created_at).toBe(new Date(NOON_TORONTO.getTime() - 60 * 60_000).toISOString()); // the time it was sent stays

    // The photo opens again with what was saved.
    await expect(screen.getByTestId("feed-viewer-tag")).toContainText("Walks");
    await expect(screen.getByTestId("feed-viewer-tag")).toContainText("Potty");
    await expect(screen.getByTestId("feed-viewer-note")).toHaveText("Walk, then a potty break");
    await expect(screen.getByTestId("feed-viewer-date")).toHaveText("Oct 8, 2026 · 9:30 AM");
    await screen.getByTestId("feed-viewer-close").click();

    // It is now under both chips, and under yesterday.
    await screen.getByTestId("feed-filter-walk").click();
    await expect(screen.getByTestId(`feed-card-${ids(0)}`)).toBeVisible();
    await screen.getByTestId("feed-filter-potty").click();
    await expect(screen.getByTestId(`feed-card-${ids(0)}`)).toBeVisible();
    await screen.getByTestId("feed-filter-all").click();
    const headers = await screen.locator("[data-testid^='feed-day-']").allInnerTexts();
    expect(headers.map((h) => h.split("\n")[0])).toEqual(["Today · Fri Oct 9", "Yesterday · Thu Oct 8"]);
    // Two tag drawings on the photo.
    await expect(screen.getByTestId(`feed-badge-${ids(0)}`).locator("svg")).toHaveCount(2);
  });

  test("clearing the tags and the memo leaves a plain photo", async ({ page }) => {
    const db = await seeded(page, SITTER);
    const screen = app(page);
    await screen.getByTestId(`feed-card-${ids(0)}`).click();
    await screen.getByTestId("feed-viewer-edit").click();
    await screen.getByTestId("feed-edit-tag-walk").click();
    await screen.getByTestId("feed-edit-note").fill("");
    await screen.getByTestId("feed-edit-save").click();
    await expect(screen.getByTestId("toast")).toContainText("Photo updated");
    expect(db.feed_posts.find((p) => p.id === ids(0))).toMatchObject({ tags: [], note: null });
    await screen.getByTestId("feed-viewer-close").click();
    await screen.getByTestId("feed-filter-none").click();
    await expect(screen.getByTestId(`feed-card-${ids(0)}`)).toBeVisible();
  });

  test("only the author has Edit", async ({ page }) => {
    await seeded(page, SITTER);
    const screen = app(page);
    await screen.getByTestId(`feed-card-${ids(2)}`).click(); // the owner's photo, seen by the sitter
    await expect(screen.getByTestId("feed-viewer-page-" + ids(2))).toBeVisible();
    await expect(screen.getByTestId("feed-viewer-edit")).toHaveCount(0);
    await expect(screen.getByTestId("feed-viewer-hide")).toBeVisible();
  });

  test("a time that has not come yet is refused with a clear line", async ({ page }) => {
    await seeded(page, SITTER);
    const screen = app(page);
    await screen.getByTestId(`feed-card-${ids(0)}`).click();
    await screen.getByTestId("feed-viewer-edit").click();
    await screen.getByTestId("feed-edit-time").click();
    await screen.getByTestId("time-hour-11").click();
    await screen.getByTestId("time-min-30").click();
    await screen.getByTestId("time-ampm-pm").click();
    await screen.getByTestId("feed-edit-time-picker-set").click();
    await screen.getByTestId("feed-edit-save").click();
    await expect(screen.getByTestId("toast")).toContainText("Pick a time that has already passed.");
    await expect(screen.getByTestId("feed-edit-sheet")).toBeVisible();
  });

  test("the pet dropdown drops right under its button, and a tap outside closes it", async ({ page }) => {
    const MOCHI_ID = "00000000-0000-4000-8000-0000000000bb";
    const { db } = await mockSupabase(page, [OWNER, SITTER], { now: NOON_TORONTO });
    caring(db, [{ id: PET_ID, name: "Max", species: "dog" }, { id: MOCHI_ID, name: "Mochi", species: "cat" }], NOON_TORONTO);
    await signIn(page, SITTER);
    await app(page).getByRole("heading", { name: /^(Home|Today)$/ }).first().waitFor();
    await page.goto("/sitter/feed");
    await app(page).getByTestId("feed-filters").waitFor();
    const screen = app(page);
    const pill = await box(screen.getByTestId("feed-pet"));
    await screen.getByTestId("feed-pet").click();
    const menu = await box(screen.getByTestId("feed-pet-menu"));
    expect(menu.y).toBeCloseTo(pill.y + pill.height + 4, 0);
    // Lined up with one edge of the button, and inside the phone: a button near the right edge opens it leftward.
    const phone = await box(page.locator('iframe[title="Goldito app"]'));
    const leftAligned = Math.abs(menu.x - pill.x) < 1;
    const rightAligned = Math.abs(menu.x + menu.width - (pill.x + pill.width)) < 1;
    expect(leftAligned || rightAligned).toBe(true);
    expect(menu.x).toBeGreaterThanOrEqual(phone.x);
    expect(menu.x + menu.width).toBeLessThanOrEqual(phone.x + phone.width);
    // No bottom sheet: the menu is a small box, not a full-width panel.
    expect(menu.width).toBeLessThan(330);
    await screen.getByTestId("feed-pet-backdrop").click({ position: { x: 5, y: 600 } });
    await expect(screen.getByTestId("feed-pet-menu")).toHaveCount(0);
  });
});
