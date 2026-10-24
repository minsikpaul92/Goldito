import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { caring } from "./careFixtures";
import { HOUR } from "./careFixtures";
import { NOON_TORONTO, app, box, drag, signIn } from "./helpers";
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

    await app(page).getByTestId("feed-hidden-open").click();
    await expect(app(page).getByTestId(`feed-card-${post(1)}`)).toBeVisible();
    await expect(app(page).getByTestId(`feed-card-${post(0)}`)).toHaveCount(0);
    await app(page).getByTestId(`feed-card-${post(1)}`).click();
    await expect(app(page).getByTestId("feed-viewer-hide")).toHaveText("Unhide");
    await app(page).getByTestId("feed-viewer-hide").click();
    expect(db.feed_post_hidden).toHaveLength(0);
    await expect(app(page).getByText("Nothing hidden")).toBeVisible();
    await app(page).getByTestId("feed-hidden-back").click();
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
    await expect(app(page).getByTestId("feed-filters")).toHaveCount(0);
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

  test("the pet is still in the Feed list with a Past stay label, and its photos open", async ({ page }) => {
    await pastStay(page);
    await page.goto("/sitter/feed");
    await app(page).getByTestId(`sitter-feed-pet-${PET_ID}`).waitFor();
    await expect(app(page).getByTestId(`sitter-feed-pet-${PET_ID}`)).toContainText("Past stay");
    await app(page).getByTestId(`sitter-feed-pet-${PET_ID}`).click();
    await expect(app(page).getByTestId("sitter-pet-feed")).toBeVisible();
    await expect(app(page).getByTestId(`feed-card-${post(0)}`)).toBeVisible();
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
    await expect(page).toHaveURL(new RegExp(`/sitter/feed/${PET_ID}`));
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

  test("empty state", async ({ page }) => {
    await mockSupabase(page, [OWNER, SITTER]);
    await signIn(page, OWNER);
    await app(page).getByRole("heading", { name: /^(Home|Today)$/ }).first().waitFor();
    await app(page).locator("[data-testid='notification-bell']:visible").click();
    await expect(app(page).getByText("You're all caught up.")).toBeVisible();
  });
});
