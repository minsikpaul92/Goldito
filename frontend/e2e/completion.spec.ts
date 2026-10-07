import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { app, signIn } from "./helpers";
import { MockDb, OWNER, SITTER, mockSupabase } from "./supabaseMock";

// Completion (phase-07C): the stay is over → home safe, Stay summary, one review; the sitter's profile shows the rating.

const MAX = "00000000-0000-4000-8000-0000000000c1";
const MOCHI = "00000000-0000-4000-8000-0000000000c2";
const BOOKING = "00000000-0000-4000-8000-0000000000e1";
const HOUR = 3_600_000;

function seed(db: MockDb, returned = true) {
  const now = Date.now();
  db.pets.push(
    { id: MAX, owner_id: OWNER.id, species: "dog", name: "Max", breed: null, notes: null },
    { id: MOCHI, owner_id: OWNER.id, species: "cat", name: "Mochi", breed: null, notes: null },
  );
  db.sitter_profiles.push({ id: SITTER.id, bio: "Cozy home", service_area: "North York", experience_years: 3, home_notes: null, home_address: null, services: ["boarding"] });
  db.bookings.push({
    id: BOOKING, owner_id: OWNER.id, sitter_id: SITTER.id, status: "confirmed", service_type: "boarding",
    meet_greet_status: "not_needed", paid_at: new Date(now - 100 * HOUR).toISOString(), created_at: "2026-10-01T10:00:00Z",
  });
  db.booking_pets.push({ booking_id: BOOKING, pet_id: MAX }, { booking_id: BOOKING, pet_id: MOCHI });
  for (const [kind, at, done] of [["drop_off", now - 72 * HOUR, true], ["pick_up", now - 2 * HOUR, returned]] as const) {
    db.booking_handoffs.push({
      id: `h-${kind}`, booking_id: BOOKING, kind, scheduled_at: new Date(at).toISOString(), location_type: "sitter_home", location_note: null,
      within_sitter_hours: true, status: "agreed", proposed_by: OWNER.id, completed_at: done ? new Date(at).toISOString() : null, created_at: "2026-10-01T10:00:00Z",
    });
  }
  // What happened during the stay.
  db.daily_reports.push(
    { id: "r1", pet_id: MAX, sitter_id: SITTER.id, report_date: "2026-10-05", body: "Max had a calm day. We walked twice.", status: "sent", sent_at: new Date(now - 50 * HOUR).toISOString(), source_snapshot: null },
    { id: "r2", pet_id: MAX, sitter_id: SITTER.id, report_date: "2026-10-06", body: "A playful last day! Max chased his ball.", status: "sent", sent_at: new Date(now - 26 * HOUR).toISOString(), source_snapshot: null },
    { id: "r3", pet_id: MAX, sitter_id: SITTER.id, report_date: "2026-10-04", body: "Before the stay.", status: "sent", sent_at: new Date(now - 90 * HOUR).toISOString(), source_snapshot: null },
  );
  for (let i = 0; i < 3; i++) {
    db.media.push({ id: `m${i}`, pet_id: MAX, cloudinary_public_id: `goldito/${MAX}/feed/m${i}`, resource_type: "image", purpose: "feed" });
    db.feed_posts.push({ id: `f${i}`, pet_id: MAX, sitter_id: SITTER.id, posted_by: SITTER.id, visibility: "shared", media_id: `m${i}`, caption: "x", caption_source: "ai", category: null, task_log_id: null, created_at: new Date(now - (20 + i) * HOUR).toISOString() });
  }
  db.care_tasks.push({ id: "t1", pet_id: MAX, type: "feeding", title: "Breakfast", scheduled_time: "08:00:00", active: true });
  for (let i = 0; i < 4; i++) {
    db.task_logs.push({ id: `l${i}`, task_id: "t1", pet_id: MAX, due_at: new Date(now - (30 + i * 5) * HOUR).toISOString(), status: i === 3 ? "pending" : "done", completed_at: null });
  }
}

async function open(page: Page, path = `/owner/bookings/${BOOKING}`, returned = true) {
  const { db } = await mockSupabase(page, [OWNER, SITTER]);
  seed(db, returned);
  await signIn(page, OWNER);
  await app(page).getByRole("heading", { name: "Home" }).waitFor();
  await page.goto(path);
  return db;
}

test.describe("finished stay", () => {
  test("home safe, the Stay summary, and one review that the sitter is told about", async ({ page }) => {
    const db = await open(page);
    const screen = app(page);
    await expect(screen.getByTestId("home-safe")).toHaveText("Max & Mochi are home safe 🏠");
    await expect(screen.getByTestId("summary-reports")).toContainText("2"); // the report before the stay is not counted
    await expect(screen.getByTestId("summary-photos")).toContainText("3");
    await expect(screen.getByTestId("summary-tasks")).toContainText("3");
    await expect(screen.getByTestId("summary-last-report")).toHaveText("“A playful last day!”");

    await screen.getByTestId("leave-review").click();
    await expect(page).toHaveURL(new RegExp(`/owner/bookings/${BOOKING}/review$`));
    await expect(screen.getByTestId("review-send")).toBeDisabled(); // no stars yet
    await screen.getByTestId("review-rating-4").click();
    await expect(screen.getByTestId("review-rating-4")).toHaveAttribute("aria-checked", "true");
    await screen.getByTestId("review-comment").fill("Max came home happy and tired!");
    await screen.getByTestId("review-send").click();

    await expect(screen.getByTestId("toast")).toContainText("Chloe was told");
    expect(db.reviews).toHaveLength(1);
    expect(db.reviews[0]).toMatchObject({ booking_id: BOOKING, rating: 4, comment: "Max came home happy and tired!", sitter_id: SITTER.id });
    expect(db.notifications.find((n) => n.type === "review_received")?.user_id).toBe(SITTER.id);

    // Back on the booking: read-only stars, no way to review twice.
    await expect(page).toHaveURL(new RegExp(`/owner/bookings/${BOOKING}$`));
    await expect(screen.getByTestId("review-done")).toContainText("Max came home happy and tired!");
    await expect(screen.getByTestId("leave-review")).toHaveCount(0);
    await page.goto(`/owner/bookings/${BOOKING}/review`);
    await expect(screen.getByText("you already reviewed this stay", { exact: false })).toBeVisible();
  });

  test("before the pets are back there is no summary and no review", async ({ page }) => {
    await open(page, `/owner/bookings/${BOOKING}`, false);
    const screen = app(page);
    await expect(screen.getByTestId("booking-sitter")).toBeVisible();
    await expect(screen.getByTestId("home-safe")).toHaveCount(0);
    await expect(screen.getByTestId("stay-summary")).toHaveCount(0);
    await expect(screen.getByTestId("leave-review")).toHaveCount(0);
    await page.goto(`/owner/bookings/${BOOKING}/review`);
    await expect(screen.getByText("Not ready yet")).toBeVisible();
  });

  test("a refused review says why and keeps the stars", async ({ page }) => {
    await open(page, `/owner/bookings/${BOOKING}/review`);
    await page.route("**/rest/v1/rpc/submit_review", (route) =>
      route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ code: "P0001", message: "already_reviewed" }) }),
    );
    const screen = app(page);
    await screen.getByTestId("review-rating-5").click();
    await screen.getByTestId("review-send").click();
    await expect(screen.getByTestId("review-error")).toHaveText("You already reviewed this stay.");
    await expect(screen.getByTestId("review-rating-5")).toHaveAttribute("aria-checked", "true");
  });
});

test.describe("sitter rating", () => {
  test("the sitter's profile shows the average, the count and recent comments with first names", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    seed(db);
    const review = (n: number, rating: number, comment: string | null) =>
      db.reviews.push({ id: `rv${n}`, booking_id: `b${n}`, owner_id: OWNER.id, sitter_id: SITTER.id, rating, comment, created_at: new Date(Date.now() - n * HOUR).toISOString() });
    review(1, 5, "Wonderful with Max!");
    review(2, 4, null);
    review(3, 5, "Daily photos made my week.");
    await signIn(page, OWNER);
    await app(page).getByRole("heading", { name: "Home" }).waitFor();
    await page.goto(`/owner/sitters/${SITTER.id}`);
    const screen = app(page);
    await expect(screen.getByTestId("sitter-rating-line")).toHaveText("★ 4.7 · 3 reviews");
    await expect(screen.getByTestId("sitter-review")).toHaveCount(2); // only reviews with a comment
    await expect(screen.getByTestId("sitter-rating")).toContainText("“Wonderful with Max!” — Robert");
  });

  test("no reviews yet: no rating line", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    seed(db);
    await signIn(page, OWNER);
    await app(page).getByRole("heading", { name: "Home" }).waitFor();
    await page.goto(`/owner/sitters/${SITTER.id}`);
    await expect(app(page).getByTestId("sitter-name")).toBeVisible();
    await expect(app(page).getByTestId("sitter-rating")).toHaveCount(0);
  });
});
