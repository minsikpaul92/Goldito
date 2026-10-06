import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { app, box, drag, signIn } from "./helpers";
import { OWNER, SITTER, mockSupabase } from "./supabaseMock";
import type { MockUser } from "./supabaseMock";

// Feed album viewer, author delete, and the notification center (phase-05 5.2 · 5.5 · 5.7 · 5.10).

const PET_ID = "00000000-0000-4000-8000-0000000000aa";
const post = (n: number) => `00000000-0000-4000-8000-00000000f00${n}`;
const media = (n: number) => `00000000-0000-4000-8000-00000000e00${n}`;
// Newest first: a video (index 0), then two photos.
const KINDS = ["video", "image", "image"] as const;

async function setup(page: Page, user: MockUser) {
  const { db } = await mockSupabase(page, [OWNER, SITTER]);
  db.pets.push({ id: PET_ID, owner_id: OWNER.id, species: "dog", name: "Max", breed: null, notes: null });
  KINDS.forEach((kind, i) => {
    db.media.push({
      id: media(i),
      pet_id: PET_ID,
      cloudinary_public_id: `pawddy/${PET_ID}/feed/m${i}`,
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

  const deleted: string[] = [];
  await page.route("**/api/feed/*", (route) => {
    const id = route.request().url().split("/").pop()!;
    deleted.push(id);
    db.feed_posts.splice(0, db.feed_posts.length, ...db.feed_posts.filter((p) => p.id !== id));
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ deleted: true, media_removed: true }),
    });
  });

  await signIn(page, user);
  await app(page).getByRole("heading", { name: "Home" }).waitFor();
  return { db, deleted };
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

  test("owner has no Delete button", async ({ page }) => {
    await setup(page, OWNER);
    await page.goto("/owner/feed");
    await app(page).getByTestId(`feed-card-${post(1)}`).click();
    await expect(app(page).getByTestId("feed-viewer")).toBeVisible();
    await expect(app(page).getByTestId("feed-viewer-delete")).toHaveCount(0);
  });
});

test.describe("Author delete", () => {
  test("cancel keeps the post and reopens on it; confirm deletes it", async ({ page }) => {
    const { deleted } = await setup(page, SITTER);
    await page.goto(`/sitter/feed/${PET_ID}`);
    await app(page).getByTestId(`feed-card-${post(1)}`).click();
    await app(page).getByTestId("feed-viewer-next").click();
    await expect(app(page).getByTestId(`feed-viewer-page-${post(2)}`)).toBeVisible();

    await app(page).getByTestId("feed-viewer-delete").click();
    await expect(app(page).getByTestId("feed-delete-sheet")).toBeVisible();
    await app(page).getByTestId("feed-delete-sheet-close").click();
    expect(deleted).toEqual([]);
    // Back on the post that was being deleted, not the one first tapped.
    await expect(app(page).getByTestId(`feed-viewer-page-${post(2)}`)).toBeVisible();

    await app(page).getByTestId("feed-viewer-delete").click();
    await app(page).getByTestId("feed-delete-confirm").click();
    await expect(app(page).getByTestId("toast")).toContainText("Photo deleted");
    expect(deleted).toEqual([post(2)]);
    await expect(app(page).getByTestId(`feed-card-${post(2)}`)).toHaveCount(0);
    await expect(app(page).getByTestId(`feed-card-${post(1)}`)).toBeVisible();
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
    await app(page).getByRole("heading", { name: "Home" }).waitFor();

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
    db.pets.push({ id: PET_ID, owner_id: OWNER.id, species: "dog", name: "Max", breed: null, notes: null });
    db.notifications.push({
      id: n(7),
      user_id: SITTER.id,
      type: "feed_post",
      title: "Chloe shared a photo of Max 📸",
      body: null,
      pet_id: PET_ID,
      booking_id: null,
      ref_id: null,
      read_at: null,
      created_at: new Date().toISOString(),
    });
    await signIn(page, SITTER);
    await app(page).getByRole("heading", { name: "Home" }).waitFor();
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
    await app(page).getByRole("heading", { name: "Home" }).waitFor();
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
    await screen.getByRole("heading", { name: "Home" }).waitFor();
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
    await app(page).getByRole("heading", { name: "Home" }).waitFor();
    await app(page).locator("[data-testid='notification-bell']:visible").click();
    await expect(app(page).getByText("You're all caught up.")).toBeVisible();
  });
});
