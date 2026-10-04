import { devices, expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { app, signIn } from "./helpers";
import { MockDb, OWNER, SITTER, mockSupabase } from "./supabaseMock";

// Sitter Home: today's tasks, Mark done, Done with photo (phase-06 6.3).

const HOUR = 3_600_000;
const PET = "00000000-0000-4000-8000-0000000000aa";

function caringMax(db: MockDb) {
  const now = Date.now();
  db.pets.push({ id: PET, owner_id: OWNER.id, species: "dog", name: "Max", breed: null, notes: null });
  db.bookings.push({
    id: "b1",
    owner_id: OWNER.id,
    sitter_id: SITTER.id,
    status: "confirmed",
    service_type: "boarding",
    meet_greet_status: "not_needed",
    created_at: "2026-10-02T18:00:00Z",
  });
  db.booking_pets.push({ booking_id: "b1", pet_id: PET });
  for (const [kind, at] of [
    ["drop_off", now - 24 * HOUR],
    ["pick_up", now + 48 * HOUR],
  ] as const) {
    db.booking_handoffs.push({
      id: `b1-${kind}`,
      booking_id: "b1",
      kind,
      scheduled_at: new Date(at).toISOString(),
      location_type: "sitter_home",
      location_note: null,
      within_sitter_hours: true,
      status: "agreed",
      proposed_by: OWNER.id,
      completed_at: kind === "drop_off" ? new Date(at).toISOString() : null,
      created_at: "2026-10-02T18:00:00Z",
    });
  }
}

function task(id: string, type: string, title: string, time: string, extra: object = {}) {
  return {
    id,
    pet_id: PET,
    type,
    title,
    dose: null,
    scheduled_time: time,
    repeat_daily: true,
    notes: null,
    active: true,
    created_at: "2026-10-01T10:00:00Z",
    ...extra,
  };
}


/** Mocks sign → Cloudinary → complete for a task_proof photo; returns the sign requests. */
async function mockUpload(page: Page, db: MockDb) {
  const sign: Record<string, unknown>[] = [];
  await page.route("**/api/media/sign", (route) => {
    const body = route.request().postDataJSON();
    sign.push(body);
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        cloud_name: "pawnote-test",
        api_key: "1",
        timestamp: 1,
        signature: "s",
        folder: `pawnote/${body.pet_id}/${body.purpose}`,
        upload_url: "http://127.0.0.1:4173/cloudinary-mock/image/upload",
        transformation: "c_limit,w_2000/q_auto",
      }),
    });
  });
  await page.route("**/cloudinary-mock/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ public_id: `pawnote/${PET}/task_proof/abc`, width: 10, height: 10 }),
    }),
  );
  await page.route("**/api/media/complete", (route) => {
    db.media.push({
      id: "media-proof",
      pet_id: PET,
      cloudinary_public_id: `pawnote/${PET}/task_proof/abc`,
      resource_type: "image",
      purpose: "task_proof",
    });
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ media_id: "media-proof", public_id: "x", secure_url: "x", thumb_url: "" }),
    });
  });
  return sign;
}

test.describe("sitter today's tasks", () => {
  test("opening Home creates today's logs and shows what is next", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    caringMax(db);
    db.care_tasks.push(
      task("t-walk", "walk", "Walk", "17:00"),
      task("t-pill", "medication", "Joint pill", "20:00", { dose: "1 tablet" }),
      task("t-off", "play", "Paused play", "12:00", { active: false }),
    );
    await signIn(page, SITTER);
    const screen = app(page);

    await expect(screen.getByTestId("today-tasks")).toBeVisible();
    await expect(screen.getByText("Joint pill")).toBeVisible();
    expect(db.task_logs).toHaveLength(2);
    await expect(screen.getByText("Paused play")).toHaveCount(0);
    await expect(screen.getByTestId("tasks-next")).toContainText("Next up: Max");
  });

  test("Mark done finishes it, tells the owner, and posts nothing to the feed", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    caringMax(db);
    db.care_tasks.push(task("t-meal", "feeding", "Breakfast", "08:00"));
    await signIn(page, SITTER);
    const screen = app(page);

    const log = (await screen.locator("[data-testid^='task-done-']").first().getAttribute("data-testid"))!;
    await screen.getByTestId(log).click();
    await expect(screen.getByTestId("toast")).toContainText("Breakfast done ✅ Chloe was told");

    expect(db.taskCompletions).toHaveLength(1);
    expect(db.taskCompletions[0].p_media_id).toBeNull();
    expect(db.task_logs[0].status).toBe("done");
    expect(db.notifications.filter((n) => n.type === "task_done" && n.user_id === OWNER.id)).toHaveLength(1);
    expect(db.feed_posts).toHaveLength(0);
    // Done tasks lose their buttons and show the badge.
    await expect(screen.locator("[data-testid^='task-done-']")).toHaveCount(0);
    await expect(screen.locator("[data-testid^='task-status-']").first()).toContainText("✅ Done");
  });

  test("Done with photo uploads a task_proof and attaches it", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    caringMax(db);
    db.care_tasks.push(task("t-walk", "walk", "Walk", "09:00"));

    const sign = await mockUpload(page, db);

    await signIn(page, SITTER);
    const screen = app(page);
    const photo = (await screen.locator("[data-testid^='task-photo-']").first().getAttribute("data-testid"))!;
    await screen.getByTestId(photo).click();
    await screen.getByTestId("sample-walk").click();
    // Preview first; nothing is uploaded or completed until the sitter confirms.
    await expect(screen.getByTestId("media-confirm-preview")).toBeVisible();
    expect(sign).toHaveLength(0);
    expect(db.taskCompletions).toHaveLength(0);
    await expect(screen.getByTestId("media-confirm-use")).toHaveText("Use photo & mark done");
    await screen.getByTestId("media-confirm-use").click();
    await expect(screen.getByTestId("toast")).toContainText("Walk done ✅");

    expect(sign[0]).toMatchObject({ pet_id: PET, purpose: "task_proof", resource_type: "image" });
    expect(db.taskCompletions[0].p_media_id).toBe("media-proof");
    expect(db.feed_posts).toHaveLength(1);
    expect(db.feed_posts[0]).toMatchObject({ caption_source: "task", media_id: "media-proof" });
  });

  test("Retake goes back to the picker without uploading", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    caringMax(db);
    db.care_tasks.push(task("t-walk", "walk", "Walk", "09:00"));
    const sign = await mockUpload(page, db);
    await signIn(page, SITTER);
    const screen = app(page);
    await screen.locator("[data-testid^='task-photo-']").first().click();
    await screen.getByTestId("sample-nap").click();
    await screen.getByTestId("media-confirm-retake").click();
    await expect(screen.getByTestId("media-picker")).toBeVisible();
    await expect(screen.getByTestId("media-confirm")).toHaveCount(0);
    expect(sign).toHaveLength(0);
    expect(db.taskCompletions).toHaveLength(0);
  });

  test("a pet with no tasks shows a quiet empty line", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    caringMax(db);
    await signIn(page, SITTER);
    await expect(app(page).getByTestId("tasks-empty")).toContainText("No tasks for Max today");
  });
});

// A real phone (not a demo account): no samples, but Take photo and Choose from library.
const { defaultBrowserType: _ignored, ...pixel } = devices["Pixel 7"];

test.describe("on a phone", () => {
  test.use({ ...pixel });

  const PNG = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
  );

  test("take a photo, check it, one tap uploads and marks done", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    caringMax(db);
    db.care_tasks.push(task("t-walk", "walk", "Walk", "09:00"));
    const sign = await mockUpload(page, db);
    // A touch phone runs the app full screen (no phone-frame iframe), so use `page` directly.
    await page.goto("/login");
    await page.getByTestId("login-email").fill(SITTER.email);
    await page.getByTestId("login-password").fill(SITTER.password);
    await page.getByRole("button", { name: "Sign in" }).click();
    const screen = page;

    await screen.locator("[data-testid^='task-photo-']").first().click();
    await expect(screen.getByTestId("media-take-photo")).toBeVisible();
    await expect(screen.getByTestId("media-choose-library")).toBeVisible();
    await expect(screen.locator("[data-testid^='sample-']")).toHaveCount(0);

    const chooser = page.waitForEvent("filechooser");
    await screen.getByTestId("media-take-photo").click();
    await (await chooser).setFiles({ name: "camera.png", mimeType: "image/png", buffer: PNG });

    await expect(screen.getByTestId("media-confirm-preview")).toBeVisible();
    expect(db.taskCompletions).toHaveLength(0);
    await screen.getByTestId("media-confirm-use").click();
    await expect(screen.getByTestId("toast")).toContainText("Walk done ✅");
    expect(sign[0]).toMatchObject({ purpose: "task_proof", resource_type: "image" });
    expect(db.taskCompletions[0].p_media_id).toBe("media-proof");
  });
});
