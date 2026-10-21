import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { caring } from "./careFixtures";
import { app, box, drag, signIn } from "./helpers";
import { MockDb, OWNER, SITTER, mockSupabase } from "./supabaseMock";

// Diary book (DB.3): every sent page collects in a book — all pets or one, oldest → newest, opening on the newest —
// and turns like paper with a swipe / mouse drag, or with ‹ ›. The sitter has the same book of the pages they wrote.

const MAX = { id: "00000000-0000-4000-8000-0000000000aa", name: "Max", species: "dog" } as const;
const MOCHI = { id: "00000000-0000-4000-8000-0000000000bb", name: "Mochi", species: "cat" } as const;

function sent(id: string, pet: string, day: string, body: string) {
  return { id, pet_id: pet, sitter_id: SITTER.id, report_date: day, body, status: "sent", sent_at: `${day}T22:00:00Z`, source_snapshot: { tasks: [] }, created_at: `${day}T22:00:00Z` };
}

function seed(db: MockDb) {
  caring(db, [MAX, MOCHI]);
  // Out of order on purpose: the book sorts them.
  db.daily_reports.push(
    sent("p3", MAX.id, "2026-10-07", "Third day: Max swam in the lake."),
    sent("p1", MAX.id, "2026-10-05", "First day: Max napped a lot."),
    sent("m1", MOCHI.id, "2026-10-06", "Mochi watched birds all morning."),
    { ...sent("draft", MAX.id, "2026-10-08", "SECRET DRAFT"), status: "draft", sent_at: null },
  );
}

/** The covers first; with a pet, that pet's book is open. */
async function openOwnerBook(page: Page, petId: string | null = MAX.id) {
  const { db } = await mockSupabase(page, [OWNER, SITTER]);
  seed(db);
  await signIn(page, OWNER);
  await app(page).getByRole("heading", { name: /^(Home|Today)$/ }).first().waitFor();
  await page.goto("/owner/diary");
  if (petId) {
    await app(page).getByTestId("diary-entry-cover-" + petId).click();
    await app(page).getByTestId("diary-entry-paper").waitFor();
  } else {
    await app(page).getByTestId("diary-entry-shelf").waitFor();
  }
  return db;
}

test.describe("diary book", () => {
  test("a cover per pet; a tap opens that pet's pages, ‹ Diaries goes back to the covers", async ({ page }) => {
    await openOwnerBook(page, null);
    const screen = app(page);
    await expect(screen.getByTestId("diary-entry-cover-" + MAX.id)).toContainText("Max's diary");
    await expect(screen.getByTestId("diary-entry-cover-" + MAX.id)).toContainText("2 pages");
    await expect(screen.getByTestId("diary-entry-cover-" + MOCHI.id)).toContainText("1 page");
    await expect(screen.getByTestId("diary-entry-paper")).toHaveCount(0);

    await screen.getByTestId("diary-entry-cover-" + MOCHI.id).click();
    await expect(screen.getByTestId("diary-entry-where")).toContainText("Mochi · Oct 6");
    await expect(screen.getByText("Page 1 of 1")).toBeVisible();
    await expect(screen.getByTestId("diary-entry-body")).toContainText("watched birds");
    await screen.getByTestId("diary-entry-covers").click();
    await screen.getByTestId("diary-entry-cover-" + MAX.id).click();
    await expect(screen.getByText("Page 2 of 2")).toBeVisible(); // Mochi's page is not in Max's book
  });

  test("every page has a spiral edge", async ({ page }) => {
    await openOwnerBook(page);
    await expect(app(page).getByTestId("diary-entry-spiral")).toBeVisible();
  });

  test("a pet's book opens on its newest page and turns back through the days with ‹ ›, oldest first", async ({ page }) => {
    await openOwnerBook(page);
    const screen = app(page);
    await expect(screen.getByTestId("diary-entry-where")).toContainText("Max · Oct 7");
    await expect(screen.getByText("Page 2 of 2")).toBeVisible();
    await expect(screen.getByTestId("diary-entry-next")).toBeDisabled();
    await expect(screen.getByText("SECRET DRAFT")).toHaveCount(0);

    await screen.getByTestId("diary-entry-prev").click();
    await expect(screen.getByTestId("diary-entry-where")).toContainText("Max · Oct 5");
    await expect(screen.getByText("Page 1 of 2")).toBeVisible();
    await expect(screen.getByTestId("diary-entry-prev")).toBeDisabled();
    await screen.getByTestId("diary-entry-next").click();
    await expect(screen.getByTestId("diary-entry-where")).toContainText("Max · Oct 7");
  });

  test("a mouse drag turns the page: right → the day before, left → the day after; a short drag springs back", async ({ page }) => {
    await openOwnerBook(page);
    const screen = app(page);
    const stage = await box(screen.getByTestId("diary-entry-stage"));
    const y = stage.y + 120;
    // Drag to the right: the previous page comes over.
    await drag(page, { x: stage.x + 40, y }, { x: stage.x + stage.width - 20, y }, 16);
    await expect(screen.getByTestId("diary-entry-where")).toContainText("Max · Oct 5");
    // A short, slow drag is not enough (Playwright's moves have no time between them, so pace it: no flick).
    await page.mouse.move(stage.x + stage.width - 40, y);
    await page.mouse.down();
    for (let dx = 4; dx <= 32; dx += 4) {
      await page.mouse.move(stage.x + stage.width - 40 - dx, y);
      await page.waitForTimeout(40);
    }
    await page.waitForTimeout(200);
    await page.mouse.up();
    await page.waitForTimeout(500);
    await expect(screen.getByTestId("diary-entry-where")).toContainText("Max · Oct 5");
    // Drag to the left: the next page.
    await drag(page, { x: stage.x + stage.width - 20, y }, { x: stage.x + 20, y }, 16);
    await expect(screen.getByTestId("diary-entry-where")).toContainText("Max · Oct 7");
  });

  test("a long page scrolls with the wheel and with a mouse drag, shows a scrollbar, and the drag does not turn the page", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    caring(db, [MAX]);
    db.daily_reports.push(sent("long", MAX.id, "2026-10-05", Array.from({ length: 80 }, (_, i) => `Max did thing number ${i}.`).join(" ")));
    await signIn(page, OWNER);
    await app(page).getByRole("heading", { name: /^(Home|Today)$/ }).first().waitFor();
    await page.goto("/owner/diary");
    const screen = app(page);
    await screen.getByTestId("diary-entry-cover-" + MAX.id).click();
    await screen.getByTestId("diary-entry-paper").waitFor();

    const scroller = screen.getByTestId("owner-diary-screen");
    await expect(scroller).toHaveAttribute("data-scrollbar", "true");
    const top = () => scroller.evaluate((el) => el.scrollTop);
    expect(await top()).toBe(0);

    // The visible part of the screen (the page is much taller than it).
    const view = await box(scroller);
    const x = view.x + view.width / 2;
    await page.mouse.move(x, view.y + view.height / 2);
    await page.mouse.wheel(0, 300);
    await expect.poll(top).toBeGreaterThan(100);

    const before = await top();
    await drag(page, { x, y: view.y + view.height * 0.7 }, { x, y: view.y + view.height * 0.3 }, 16);
    await expect.poll(top).toBeGreaterThan(before);
    await expect(screen.getByTestId("diary-entry-where")).toContainText("Max · Oct 5"); // still the same page
  });

  test("a notice link opens the book on that page", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    seed(db);
    await signIn(page, OWNER);
    await app(page).getByRole("heading", { name: /^(Home|Today)$/ }).first().waitFor();
    await page.goto("/owner/diary/p1");
    const screen = app(page);
    await expect(screen.getByTestId("diary-entry-where")).toContainText("Max · Oct 5");
    await expect(screen.getByText("Page 1 of 2")).toBeVisible();
  });

  test("Feed: sent pages sit among the photos by time, the day's first photo as the thumbnail; a tap opens the book", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    seed(db);
    // Two shared photos on Oct 5 (the earlier one is the thumbnail), none on Oct 7.
    for (const [n, at] of [[1, "2026-10-05T15:00:00Z"], [2, "2026-10-05T18:00:00Z"]] as const) {
      db.media.push({ id: `m-${n}`, pet_id: MAX.id, cloudinary_public_id: `goldito/${MAX.id}/feed/p${n}`, resource_type: "image", purpose: "feed", width: 800, height: 800, duration_s: null });
      db.feed_posts.push({ id: `post-${n}`, pet_id: MAX.id, sitter_id: SITTER.id, posted_by: SITTER.id, visibility: "shared", media_id: `m-${n}`, caption: `Photo ${n}`, caption_source: "fallback", task_log_id: null, created_at: at });
    }
    await signIn(page, OWNER);
    await app(page).getByRole("heading", { name: /^(Home|Today)$/ }).first().waitFor();
    await page.goto("/owner/feed");
    const screen = app(page);
    await screen.getByTestId("feed-diary-p1").waitFor();
    // Newest first: Oct 7's page, Oct 5's page (sent 22:00), then the photos of Oct 5.
    const order = await screen.locator('[data-testid^="feed-diary-p"], [data-testid^="feed-card-post-"]').evaluateAll((els) =>
      els.map((el) => el.getAttribute("data-testid")).filter((id) => id && !id.includes("thumb")),
    );
    expect(order).toEqual(["feed-diary-p3", "feed-diary-p1", "feed-card-post-2", "feed-card-post-1"]);
    await expect(screen.getByTestId("feed-diary-thumb-p1")).toHaveAttribute("data-public-id", `goldito/${MAX.id}/feed/p1`);
    await expect(screen.getByTestId("feed-diary-thumb-p3")).toHaveCount(0); // no photo that day: a 📔 cell
    await expect(screen.getByText("SECRET DRAFT")).toHaveCount(0);

    await screen.getByTestId("feed-diary-p1").click();
    await expect(page).toHaveURL(/\/owner\/diary\/p1$/);
    await expect(screen.getByTestId("diary-entry-where")).toContainText("Max · Oct 5");
  });

  test("the sitter's Feed has their pages too; a tap opens their Diary book on that page", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    seed(db);
    await page.route("**/api/ai/report-chips", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ summary: { tasks_done: 0, tasks_missed: 0, checkins: 0 }, chips: [], photos: [] }) }),
    );
    await signIn(page, SITTER);
    await app(page).getByRole("heading", { name: /^(Home|Today)$/ }).first().waitFor();
    await page.goto(`/sitter/feed/${MAX.id}`);
    const screen = app(page);
    await screen.getByTestId("feed-diary-p1").click();
    await expect(page).toHaveURL(/\/sitter\/diary\?page=p1$/);
    await expect(screen.getByTestId("sitter-book-where")).toContainText("Max · Oct 5");
  });

  test("the sitter's Diary book holds the pages they sent, per pet they cared for", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    seed(db);
    await page.route("**/api/ai/report-chips", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ summary: { tasks_done: 0, tasks_missed: 0, checkins: 0 }, chips: [], photos: [] }) }),
    );
    await signIn(page, SITTER);
    await app(page).getByRole("heading", { name: /^(Home|Today)$/ }).first().waitFor();
    await page.goto("/sitter/diary");
    const screen = app(page);
    await screen.getByTestId("sitter-diary-view-book").click();
    await screen.getByTestId("sitter-book-cover-" + MAX.id).click();
    await expect(screen.getByTestId("sitter-book-where")).toContainText("Max · Oct 7");
    await expect(screen.getByText("Page 2 of 2")).toBeVisible();
    await screen.getByTestId("sitter-book-covers").click();
    await screen.getByTestId("sitter-book-cover-" + MOCHI.id).click();
    await expect(screen.getByTestId("sitter-book-body")).toContainText("watched birds");
    await expect(screen.getByText("SECRET DRAFT")).toHaveCount(0);
  });
});
