import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { caring } from "./careFixtures";
import { app, signIn } from "./helpers";
import { MockDb, OWNER, SITTER, mockSupabase } from "./supabaseMock";

// The owner writes a diary page of their own (014p, #186): on the page, a photo if they like, sent to their book at
// once. No AI, no notice, and the sitter never sees it. Stickers go on the saved page like any other.

const MAX = { id: "00000000-0000-4000-8000-0000000000aa", name: "Max", species: "dog" } as const;
const MOCHI = { id: "00000000-0000-4000-8000-0000000000bb", name: "Mochi", species: "cat" } as const;

function sitterPage(day: string, body: string) {
  return { id: "s1", pet_id: MAX.id, sitter_id: SITTER.id, report_date: day, body, status: "sent", sent_at: `${day}T22:00:00Z`, source_snapshot: { tasks: [] }, created_at: `${day}T22:00:00Z` };
}

/** sign → Cloudinary → complete for a feed photo (the same pipe a real photo takes). */
async function mockFeedUpload(page: Page, db: MockDb) {
  await page.route("**/api/media/sign", (route) => {
    const body = route.request().postDataJSON();
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        cloud_name: "goldito-test",
        api_key: "123",
        timestamp: 1_700_000_000,
        signature: "sig",
        folder: `goldito/${body.pet_id}/${body.purpose}`,
        upload_url: "http://127.0.0.1:4174/cloudinary-mock/image/upload",
        transformation: "c_limit,w_2000/q_auto",
      }),
    });
  });
  await page.route("**/cloudinary-mock/**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ public_id: `goldito/${MAX.id}/feed/own`, width: 1200, height: 900 }) }),
  );
  await page.route("**/api/media/complete", (route) => {
    const body = route.request().postDataJSON();
    db.media.push({ id: "media-own", pet_id: body.pet_id, cloudinary_public_id: `goldito/${MAX.id}/feed/own`, resource_type: "image", purpose: "feed", width: 1200, height: 900, duration_s: null, created_at: new Date().toISOString() });
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ media_id: "media-own", public_id: `goldito/${MAX.id}/feed/own`, secure_url: "https://res.cloudinary.com/goldito-test/image/upload/own", thumb_url: "https://res.cloudinary.com/goldito-test/image/upload/c_fill,w_600/own" }),
    });
  });
}

async function openOwnerDiary(page: Page, seed: (db: MockDb) => void) {
  const { db } = await mockSupabase(page, [OWNER, SITTER]);
  seed(db);
  await signIn(page, OWNER);
  await app(page).getByRole("heading", { name: /^(Home|Today)$/ }).first().waitFor();
  await page.goto("/owner/diary");
  await app(page).getByTestId("diary-write").waitFor();
  return db;
}

const oneStay = (db: MockDb) => {
  caring(db, [MAX]);
  db.daily_reports.push(sitterPage("2026-10-05", "Max napped a lot."));
};

test.describe("owner diary page", () => {
  test("write a page: it lands in the book at once as 'Your page', with no notice", async ({ page }) => {
    const db = await openOwnerDiary(page, oneStay);
    const screen = app(page);
    await screen.getByTestId("diary-entry-cover-" + MAX.id).click();
    await expect(screen.getByText("From Chloe")).toBeVisible();

    await screen.getByTestId("diary-write").click();
    await expect(screen.getByTestId("diary-write-save")).toBeDisabled(); // nothing written yet
    await screen.getByTestId("diary-write-body").fill("Max met a duck at the park today.");
    await screen.getByTestId("diary-write-save").click();

    await expect(screen.getByTestId("toast")).toContainText("Page saved");
    await expect(screen.getByTestId("diary-entry-body")).toContainText("met a duck");
    await expect(screen.getByText("Your page")).toBeVisible();
    await expect(screen.getByTestId("diary-entry-prev")).toBeEnabled();
    await expect(screen.getByTestId("diary-entry-next")).toBeDisabled();

    const mine = db.daily_reports.find((r) => r.sitter_id === OWNER.id)!;
    expect(mine).toMatchObject({ pet_id: MAX.id, status: "sent", body: "Max met a duck at the park today." });
    expect(db.notifications.filter((n) => n.type === "report_sent")).toHaveLength(0);
  });

  test("an empty book still has the button; the first page opens the book", async ({ page }) => {
    await openOwnerDiary(page, (db) => caring(db, [MAX]));
    const screen = app(page);
    await expect(screen.getByText("No diary yet")).toBeVisible();
    await screen.getByTestId("diary-write").click();
    await screen.getByTestId("diary-write-body").fill("First page.");
    await screen.getByTestId("diary-write-save").click();
    await expect(screen.getByTestId("diary-entry-body")).toContainText("First page.");
    await expect(screen.getByTestId("diary-entry-prev")).toBeDisabled();
    await expect(screen.getByTestId("diary-entry-next")).toBeDisabled();
  });

  test("with two pets the page goes to the pet picked", async ({ page }) => {
    const db = await openOwnerDiary(page, (d) => caring(d, [MAX, MOCHI]));
    const screen = app(page);
    await screen.getByTestId("diary-write").click();
    await screen.getByTestId("diary-write-pet").click();
    await screen.getByTestId(`diary-write-pet-${MOCHI.id}`).click();
    await expect(screen.getByTestId("diary-write-body")).toBeVisible();
    await screen.getByTestId("diary-write-body").fill("Mochi slept on the sofa.");
    await screen.getByTestId("diary-write-save").click();
    await expect(screen.getByTestId("diary-entry-where")).toContainText("Mochi");
    expect(db.daily_reports.find((r) => r.sitter_id === OWNER.id)).toMatchObject({ pet_id: MOCHI.id });
  });

  test("a photo goes on the page with its chips and is kept in Feed, private", async ({ page }) => {
    const db = await openOwnerDiary(page, oneStay);
    await mockFeedUpload(page, db);
    const asked: Record<string, unknown>[] = [];
    await page.route("**/api/ai/diary-photo-chips", (route) => {
      asked.push(route.request().postDataJSON());
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          chips: [{ id: "photo-media-own-0", kind: "episode", label: "Lying on a blanket", source: "vision", check: null, media_id: "media-own" }],
          photos: [],
        }),
      });
    });
    const screen = app(page);
    await screen.getByTestId("diary-write").click();
    await screen.getByTestId("diary-write-body").fill("A walk in the sun.");
    // The picture box starts empty and is the button (#369).
    const picture = screen.getByTestId("diary-write-page-picture").locator("img");
    await expect(picture).toHaveCount(0);
    await screen.getByTestId("diary-write-photo").click();
    await screen.getByTestId("sample-walk").click();
    await expect(picture).toHaveCount(1);
    // The photo brings a line; tapping it puts it on the page.
    expect(asked[0]).toMatchObject({ pet_id: MAX.id, media_ids: ["media-own"] });
    await screen.getByTestId("diary-write-chip-photo-media-own-0").click();
    await expect(screen.getByTestId("diary-write-body")).toHaveValue("A walk in the sun.\nLying on a blanket.");
    await expect(screen.getByTestId("diary-write-chips")).toHaveCount(0);
    // A tap on the photo offers Add and Remove.
    await expect(screen.getByTestId("diary-write-photo-remove")).toHaveCount(0);
    await screen.getByTestId("diary-write-photo-change").click();
    await expect(screen.getByTestId("diary-write-photo-add")).toBeVisible();
    await screen.getByTestId("diary-write-photo-remove").click();
    await expect(picture).toHaveCount(0);
    await screen.getByTestId("diary-write-photo").click();
    await screen.getByTestId("sample-walk").click();
    await expect(picture).toHaveCount(1);
    await screen.getByTestId("diary-write-save").click();

    await expect(screen.getByTestId("toast")).toContainText("Page saved");
    await expect(screen.getByTestId("diary-entry-body")).toContainText("A walk in the sun.");
    expect(db.feed_posts).toHaveLength(1);
    expect(db.feed_posts[0]).toMatchObject({ pet_id: MAX.id, posted_by: OWNER.id, sitter_id: null, visibility: "private", media_id: "media-own" });
    // The page points at the photo (014t); deleting the page later leaves the Feed post alone.
    expect(db.daily_reports.find((r) => r.sitter_id === OWNER.id)).toMatchObject({ media_id: "media-own", more_media_ids: [] });

    await page.goto("/owner/feed");
    await expect(screen.locator("[data-testid^='feed-card-']")).toHaveCount(1);
  });

  test("a page with no photo saves as normal, without one", async ({ page }) => {
    const db = await openOwnerDiary(page, oneStay);
    const screen = app(page);
    await screen.getByTestId("diary-write").click();
    await screen.getByTestId("diary-write-body").fill("No photo today.");
    await expect(screen.getByTestId("diary-write-page-picture").locator("img")).toHaveCount(0);
    await screen.getByTestId("diary-write-save").click();
    await expect(screen.getByTestId("toast")).toContainText("Page saved");
    expect(db.daily_reports.find((r) => r.sitter_id === OWNER.id)?.media_id ?? null).toBeNull();
    expect(db.feed_posts).toHaveLength(0);
  });

  test("the saved page takes a Goldito sticker and a sticker made in Snap", async ({ page }) => {
    // One page only: the book keeps its neighbours mounted, and each has a Decorate button.
    const db = await openOwnerDiary(page, (d) => {
      caring(d, [MAX]);
      // A sticker the sitter made in Snap sits in the pet's box.
      d.media.push({ id: "m-st", pet_id: MAX.id, uploaded_by: SITTER.id, cloudinary_public_id: `goldito/${MAX.id}/sticker/a`, resource_type: "image", purpose: "sticker" });
      d.pet_stickers.push({ id: "st-1", pet_id: MAX.id, media_id: "m-st", created_by: SITTER.id, created_at: "2026-10-05T10:00:00Z" });
    });
    const screen = app(page);
    await screen.getByTestId("diary-write").click();
    await screen.getByTestId("diary-write-body").fill("Sticker day.");
    await screen.getByTestId("diary-write-save").click();
    await expect(screen.getByText("Your page")).toBeVisible();
    await expect(screen.getByTestId("diary-write-sheet")).toHaveCount(0); // the sheet has its own Decorate while open

    await screen.getByTestId("decor-start").click();
    await screen.getByTestId("decor-preset-heart").click();
    await screen.getByTestId("decor-add").click();
    await screen.getByTestId("decor-start").click(); // folds the tray; the stickers are already saved
    await page.waitForTimeout(300);
    const items = db.report_decor.find((r) => r.user_id === OWNER.id)?.items as { sticker_id: string }[];
    expect(items).toHaveLength(2);
    expect(items.map((i) => i.sticker_id)).toContain("st-1");
  });

  test("stickers go on while the page is written and are saved with it", async ({ page }) => {
    const db = await openOwnerDiary(page, (d) => caring(d, [MAX]));
    const screen = app(page);
    await screen.getByTestId("diary-write").click();
    await screen.getByTestId("diary-write-body").fill("Sticker day.");
    await screen.getByTestId("decor-start").click();
    await expect(screen.getByTestId("decor-share")).toHaveCount(0); // not a page yet: nothing to share
    await screen.getByTestId("decor-preset-heart").click();
    await screen.getByTestId("decor-start").click(); // folds the tray; the stickers are already saved
    await page.waitForTimeout(300);
    expect(db.report_decor).toHaveLength(0); // kept on the screen, not saved yet

    await screen.getByTestId("diary-write-save").click();
    await expect(screen.getByText("Your page")).toBeVisible();
    await expect.poll(() => (db.report_decor.find((r) => r.user_id === OWNER.id)?.items as unknown[] | undefined)?.length).toBe(1);
  });

  test("a writer deletes their own page after a confirm; the sitter's page stays", async ({ page }) => {
    const db = await openOwnerDiary(page, oneStay);
    const screen = app(page);
    await screen.getByTestId("diary-write").click();
    await screen.getByTestId("diary-write-body").fill("A page to delete.");
    await screen.getByTestId("diary-write-save").click();
    await expect(screen.getByText("Your page")).toBeVisible();
    await expect(screen.getByTestId("diary-write-sheet")).toHaveCount(0);
    const mine = db.daily_reports.find((r) => r.sitter_id === OWNER.id)!;

    await screen.getByTestId(`diary-page-delete-${mine.id}`).click();
    await expect(screen.getByText("It is deleted for good.")).toBeVisible();
    await screen.getByTestId(`diary-page-delete-${mine.id}-confirm`).click();
    await expect(screen.getByTestId("toast")).toContainText("Page deleted");
    await expect(screen.getByText("Your page")).toHaveCount(0);
    expect(db.daily_reports.map((r) => r.id)).toEqual(["s1"]); // the sitter's page is not touched
    await expect(screen.getByText("From Chloe")).toBeVisible();
  });

  test("the owner hides a sitter's page on their own side only; the sitter keeps it", async ({ page }) => {
    const db = await openOwnerDiary(page, oneStay);
    const screen = app(page);
    await screen.getByTestId("diary-entry-cover-" + MAX.id).click();
    await screen.getByTestId("diary-page-hide-s1").click();
    await expect(screen.getByText("It leaves your diary. Chloe keeps their copy.")).toBeVisible();
    await screen.getByTestId("diary-page-hide-s1-confirm").click();
    await expect(screen.getByTestId("toast")).toContainText("Page hidden");
    await expect(screen.getByText("No diary yet")).toBeVisible();
    expect(db.diary_page_hidden).toHaveLength(1);
    expect(db.daily_reports.map((r) => r.id)).toEqual(["s1"]); // the sitter's copy stays

    await page.reload();
    await app(page).getByText("No diary yet").waitFor();
  });

  test("a sitter deletes a page they wrote; the owner loses it too", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    oneStay(db);
    db.notifications.push({ id: "n1", user_id: OWNER.id, type: "report_sent", title: "Chloe sent Max's daily report", ref_id: "s1", pet_id: MAX.id, read_at: null, created_at: new Date().toISOString() });
    await page.route("**/api/ai/report-chips", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ summary: { tasks_done: 0, tasks_missed: 0, checkins: 0 }, chips: [], photos: [] }) }),
    );
    await signIn(page, SITTER);
    await app(page).getByRole("heading", { name: /^(Home|Today)$/ }).first().waitFor();
    await page.goto("/sitter/diary");
    const screen = app(page);
    await screen.getByTestId("sitter-book-cover-" + MAX.id).click();
    await screen.getByTestId("diary-page-delete-s1").click();
    await expect(screen.getByText("It is deleted for good. The owner loses it too.")).toBeVisible();
    await screen.getByTestId("diary-page-delete-s1-confirm").click();
    await expect(screen.getByTestId("toast")).toContainText("Page deleted");
    await expect(screen.getByText("No pages yet")).toBeVisible();
    expect(db.daily_reports).toHaveLength(0);
    expect(db.notifications.some((n) => n.ref_id === "s1")).toBe(false);
  });

  test("the sitter does not see the owner's page", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    oneStay(db);
    db.daily_reports.push({ ...sitterPage("2026-10-06", "OWNER'S PRIVATE PAGE"), id: "o1", sitter_id: OWNER.id });
    await page.route("**/api/ai/report-chips", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ summary: { tasks_done: 0, tasks_missed: 0, checkins: 0 }, chips: [], photos: [] }) }),
    );
    await signIn(page, SITTER);
    await app(page).getByRole("heading", { name: /^(Home|Today)$/ }).first().waitFor();
    await page.goto("/sitter/diary");
    const screen = app(page);
    await screen.getByTestId("sitter-book-cover-" + MAX.id).click();
    await expect(screen.getByTestId("sitter-book-body")).toContainText("Max napped a lot.");
    await expect(screen.getByTestId("sitter-book-prev")).toBeDisabled();
    await expect(screen.getByTestId("sitter-book-next")).toBeDisabled();
    await expect(screen.getByText("OWNER'S PRIVATE PAGE")).toHaveCount(0);
  });
});
