import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { app, signIn } from "./helpers";
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
      cloudinary_public_id: `pawnote/${PET_ID}/feed/m${i}`,
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
    await app(page).getByTestId("notification-bell").last().click();
    await expect(app(page).getByTestId("notifications-center")).toBeVisible();

    await app(page).getByTestId(`notification-${n(0)}`).click();
    await expect(page).toHaveURL(/\/owner\/feed/);
    expect(db.notifications.find((x) => x.id === n(0))?.read_at).toBeTruthy();
    await expect(app(page).getByTestId("notification-badge").first()).toHaveText("1");

    await app(page).getByTestId("notification-bell").last().click();
    await app(page).getByTestId("mark-all-read").last().click();
    await expect(app(page).getByTestId("notification-badge")).toHaveCount(0);
    expect(db.notifications.every((x) => x.read_at)).toBe(true);
  });

  test("empty state", async ({ page }) => {
    await mockSupabase(page, [OWNER, SITTER]);
    await signIn(page, OWNER);
    await app(page).getByRole("heading", { name: "Home" }).waitFor();
    await app(page).getByTestId("notification-bell").last().click();
    await expect(app(page).getByText("You're all caught up.")).toBeVisible();
  });
});
