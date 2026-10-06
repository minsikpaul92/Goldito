import { expect, test } from "@playwright/test";

import { app, signIn } from "./helpers";
import { OWNER, SITTER, mockSupabase } from "./supabaseMock";

// Owner History (the 6.11 timeline, moved off the Diary tab): what the sitter did, newest first, photos once.

const MAX = "00000000-0000-4000-8000-0000000000aa";
const MOCHI = "00000000-0000-4000-8000-0000000000bb";
const MIN = 60_000;
const iso = (minutesAgo: number) => new Date(Date.now() - minutesAgo * MIN).toISOString();

function seed(db: Awaited<ReturnType<typeof mockSupabase>>["db"]) {
  db.pets.push(
    { id: MAX, owner_id: OWNER.id, species: "dog", name: "Max", breed: null, birthdate: null, weight_kg: null, notes: null, created_at: "2026-10-01T09:00:00Z" },
    { id: MOCHI, owner_id: OWNER.id, species: "cat", name: "Mochi", breed: null, birthdate: null, weight_kg: null, notes: null, created_at: "2026-10-01T09:05:00Z" },
  );
  const media = (id: string) => ({
    id,
    pet_id: MAX,
    cloudinary_public_id: `pawddy/${MAX}/task_proof/${id}`,
    resource_type: "image",
    purpose: "task_proof",
  });
  db.media.push(media("m-task"), media("m-checkin"), media("m-feed"));
  db.care_tasks.push(
    { id: "t-meal", pet_id: MAX, type: "feeding", title: "Breakfast", scheduled_time: "08:00:00", active: true },
    { id: "t-walk", pet_id: MAX, type: "walk", title: "Walk", scheduled_time: "09:00:00", active: true },
    { id: "t-pill", pet_id: MAX, type: "medication", title: "Joint pill", scheduled_time: "10:00:00", active: true },
  );
  db.task_logs.push(
    { id: "l-meal", task_id: "t-meal", pet_id: MAX, due_at: iso(200), status: "done", completed_at: iso(190), completed_by: SITTER.id, media_id: "m-task" },
    { id: "l-walk", task_id: "t-walk", pet_id: MAX, due_at: iso(150), status: "done", completed_at: iso(140), completed_by: SITTER.id, media_id: null },
    { id: "l-pill", task_id: "t-pill", pet_id: MAX, due_at: iso(120), status: "pending", completed_at: null, completed_by: null, media_id: null },
  );
  db.care_checkins.push(
    { id: "c-meal", pet_id: MAX, created_by: SITTER.id, kind: "meal", value: "all", note_text: null, media_id: null, created_at: iso(60) },
    { id: "c-mood", pet_id: MAX, created_by: SITTER.id, kind: "mood", value: "calm", note_text: "Hid under the bed for a while", media_id: null, created_at: iso(50) },
    { id: "c-note", pet_id: MAX, created_by: SITTER.id, kind: "note", value: null, note_text: "Watched a squirrel for ten minutes", media_id: null, created_at: iso(40) },
    { id: "c-photo", pet_id: MAX, created_by: SITTER.id, kind: "walk", value: "30", note_text: null, media_id: "m-checkin", created_at: iso(30) },
    { id: "c-old", pet_id: MAX, created_by: SITTER.id, kind: "meal", value: "none", note_text: null, media_id: null, created_at: iso(60 * 24 * 10) },
    { id: "c-mochi", pet_id: MOCHI, created_by: SITTER.id, kind: "potty", value: "normal", note_text: null, media_id: null, created_at: iso(20) },
  );
  db.feed_posts.push(
    // The same photos as a task and a check-in — the Diary must show each once.
    { id: "f-task", pet_id: MAX, sitter_id: SITTER.id, posted_by: SITTER.id, visibility: "shared", media_id: "m-task", caption: "🍽️ Breakfast — done", caption_source: "task", task_log_id: "l-meal", created_at: iso(190) },
    { id: "f-checkin", pet_id: MAX, sitter_id: SITTER.id, posted_by: SITTER.id, visibility: "shared", media_id: "m-checkin", caption: "🦮 Max had a 30-minute walk", caption_source: "task", task_log_id: null, created_at: iso(30) },
    { id: "f-plain", pet_id: MAX, sitter_id: SITTER.id, posted_by: SITTER.id, visibility: "shared", media_id: "m-feed", caption: "Belly rubs at the park", caption_source: "fallback", task_log_id: null, created_at: iso(10) },
  );
}

async function open(page: import("@playwright/test").Page, withData = true) {
  const { db } = await mockSupabase(page, [OWNER, SITTER]);
  if (withData) seed(db);
  else {
    db.pets.push({ id: MAX, owner_id: OWNER.id, species: "dog", name: "Max", breed: null, birthdate: null, weight_kg: null, notes: null, created_at: "2026-10-01T09:00:00Z" });
  }
  await signIn(page, OWNER);
  await app(page).getByRole("heading", { name: "Home" }).waitFor();
  await page.goto("/owner/history");
  return db;
}

test.describe("owner history", () => {
  test("shows the last 7 days newest first, one row per event, photos once", async ({ page }) => {
    await open(page);
    const screen = app(page);
    await expect(screen.getByText("Breakfast · Done")).toBeVisible();

    // 3 tasks (done, done, missed) + 4 check-ins in range + 1 plain photo = 8. The 10-day-old
    // check-in is out, and the task / check-in photos are not repeated as feed rows.
    await expect(screen.locator("[data-testid^='diary-entry-']")).toHaveCount(8);
    await expect(screen.getByText("Fed · All")).toBeVisible();
    await expect(screen.getByText("Fed · None")).toHaveCount(0);
    await expect(screen.getByText("Mood · Calm")).toBeVisible();
    await expect(screen.getByText("Hid under the bed for a while")).toBeVisible();
    await expect(screen.getByText("Watched a squirrel for ten minutes")).toBeVisible();
    await expect(screen.getByText("Walk · 30 min")).toBeVisible();
    await expect(screen.getByText("Joint pill · Missed")).toBeVisible();
    await expect(screen.getByText("Belly rubs at the park")).toBeVisible();

    const ids = await screen
      .locator("[data-testid^='diary-entry-']")
      .evaluateAll((els) => els.map((e) => e.getAttribute("data-testid")));
    // Newest first: the plain photo (10 min ago) leads, the done meal task (190 min ago) is last.
    expect(ids[0]).toBe("diary-entry-feed-f-plain");
    expect(ids[ids.length - 1]).toBe("diary-entry-task-l-meal");
  });

  test("tap a row: a photo opens large, a row without a photo shows its details", async ({ page }) => {
    await open(page);
    const screen = app(page);
    await screen.getByTestId("diary-entry-checkin-c-photo").click();
    await expect(screen.getByTestId("diary-detail-photo")).toBeVisible();
    await screen.getByTestId("diary-detail-close").click();

    await screen.getByTestId("diary-entry-checkin-c-mood").click();
    await expect(screen.getByTestId("diary-detail")).toBeVisible();
    await expect(screen.getByTestId("diary-detail-photo")).toHaveCount(0);
    await expect(screen.getByTestId("diary-detail").getByText("Hid under the bed for a while")).toBeVisible();
  });

  test("each pet has its own history", async ({ page }) => {
    await open(page);
    const screen = app(page);
    await screen.getByTestId("diary-pet-" + MOCHI).click();
    await expect(screen.getByText("Potty · Normal")).toBeVisible();
    await expect(screen.locator("[data-testid^='diary-entry-']")).toHaveCount(1);
  });

  test("a quiet history explains itself", async ({ page }) => {
    await open(page, false);
    await expect(app(page).getByText("No history yet")).toBeVisible();
    await expect(app(page).getByText("What your sitter does during a stay is kept here.", { exact: false })).toBeVisible();
  });
});
