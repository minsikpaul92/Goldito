import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { app, signIn } from "./helpers";
import { OWNER, mockSupabase } from "./supabaseMock";

// Owner care tasks on the pet detail screen (phase-06 6.1).

const MAX = "00000000-0000-4000-8000-0000000000aa";
const MOCHI = "00000000-0000-4000-8000-0000000000bb";

async function setup(page: Page, petId = MAX) {
  const { db } = await mockSupabase(page, [OWNER]);
  db.pets.push(
    { id: MAX, owner_id: OWNER.id, species: "dog", name: "Max", breed: null, birthdate: null, weight_kg: null, notes: null, created_at: "2026-10-01T09:00:00Z" },
    { id: MOCHI, owner_id: OWNER.id, species: "cat", name: "Mochi", breed: null, birthdate: null, weight_kg: null, notes: null, created_at: "2026-10-01T09:05:00Z" },
  );
  await signIn(page, OWNER);
  // Let sign-in finish before navigating, or the jump can cut the session short (flaky otherwise).
  await app(page).getByRole("heading", { name: "Home" }).waitFor();
  await page.goto(`/owner/pets/${petId}`);
  await app(page).getByTestId("care-tasks").waitFor();
  return db;
}

test.describe("care tasks", () => {
  test("empty state, then a medication task is added with dose and time", async ({ page }) => {
    const db = await setup(page);
    const screen = app(page);
    await expect(screen.getByTestId("care-empty")).toBeVisible();

    await screen.getByTestId("care-add").click();
    await screen.getByTestId("care-type-medication").click();
    await expect(screen.getByTestId("care-type-medication")).toHaveAttribute("aria-checked", "true");
    await expect(screen.getByTestId("care-title")).toHaveValue("Medication");
    await screen.getByTestId("care-title").fill("Joint pill");
    await screen.getByTestId("care-dose").fill("1 tablet with food");
    // 8:00 AM → 8:30 AM
    await screen.getByTestId("care-time-plus").click();
    await screen.getByTestId("care-time-plus").click();
    await expect(screen.getByTestId("care-time-value")).toHaveText("8:30 AM");
    await screen.getByTestId("care-save").click();

    await expect(screen.getByTestId("toast")).toContainText("Added Joint pill");
    await expect(screen.getByTestId("care-empty")).toHaveCount(0);
    expect(db.care_tasks).toHaveLength(1);
    expect(db.care_tasks[0]).toMatchObject({
      pet_id: MAX,
      type: "medication",
      title: "Joint pill",
      dose: "1 tablet with food",
      scheduled_time: "08:30",
      created_by: OWNER.id,
    });
    await expect(screen.getByText("8:30 AM · every day · 1 tablet with food")).toBeVisible();
  });

  test("a cat cannot get a walk; a dog cannot get litter", async ({ page }) => {
    await setup(page, MOCHI);
    const screen = app(page);
    await screen.getByTestId("care-add").click();
    await expect(screen.getByTestId("care-type-walk")).toHaveCount(0);
    await expect(screen.getByTestId("care-type-litter")).toBeVisible();
    await screen.getByTestId("care-sheet-close").click();

    await page.goto(`/owner/pets/${MAX}`);
    await app(page).getByTestId("care-add").click();
    await expect(app(page).getByTestId("care-type-litter")).toHaveCount(0);
    await expect(app(page).getByTestId("care-type-walk")).toBeVisible();
  });

  test("a task needs a name", async ({ page }) => {
    const db = await setup(page);
    const screen = app(page);
    await screen.getByTestId("care-add").click();
    await screen.getByTestId("care-title").fill("   ");
    await screen.getByTestId("care-save").click();
    await expect(screen.getByTestId("care-error")).toHaveText("Give the task a name.");
    expect(db.care_tasks).toHaveLength(0);
  });

  test("pause, resume and delete (with confirm)", async ({ page }) => {
    const db = await setup(page);
    db.care_tasks.push({
      id: "task-1",
      pet_id: MAX,
      type: "feeding",
      title: "Breakfast",
      dose: null,
      scheduled_time: "08:00:00",
      repeat_daily: true,
      notes: null,
      active: true,
      created_at: "2026-10-01T10:00:00Z",
    });
    await page.reload();
    const screen = app(page);
    await screen.getByTestId("care-task-task-1").waitFor();

    await screen.getByTestId("care-toggle-task-1").click();
    await expect(screen.getByText("Paused", { exact: true })).toBeVisible();
    expect(db.care_tasks[0].active).toBe(false);
    await screen.getByTestId("care-toggle-task-1").click();
    await expect(screen.getByText("Paused", { exact: true })).toHaveCount(0);
    expect(db.care_tasks[0].active).toBe(true);

    await screen.getByTestId("care-delete-task-1").click();
    await expect(screen.getByTestId("care-delete-sheet")).toBeVisible();
    await screen.getByTestId("care-delete-sheet-close").click();
    expect(db.care_tasks).toHaveLength(1);

    await screen.getByTestId("care-delete-task-1").click();
    await screen.getByTestId("care-delete-confirm").click();
    await expect(screen.getByTestId("care-empty")).toBeVisible();
    expect(db.care_tasks).toHaveLength(0);
  });

  test("today's status shows once the sitter has logged the task", async ({ page }) => {
    const db = await setup(page);
    const now = Date.now();
    db.care_tasks.push(
      { id: "t-done", pet_id: MAX, type: "feeding", title: "Breakfast", dose: null, scheduled_time: "08:00:00", repeat_daily: true, notes: null, active: true, created_at: "2026-10-01T10:00:00Z" },
      { id: "t-missed", pet_id: MAX, type: "walk", title: "Walk", dose: null, scheduled_time: "09:00:00", repeat_daily: true, notes: null, active: true, created_at: "2026-10-01T10:01:00Z" },
      { id: "t-grace", pet_id: MAX, type: "play", title: "Fetch", dose: null, scheduled_time: "09:40:00", repeat_daily: true, notes: null, active: true, created_at: "2026-10-01T10:03:00Z" },
      { id: "t-later", pet_id: MAX, type: "sleep", title: "Nap", dose: null, scheduled_time: "10:00:00", repeat_daily: true, notes: null, active: true, created_at: "2026-10-01T10:02:00Z" },
    );
    const iso = (offsetMin: number) => new Date(now + offsetMin * 60_000).toISOString();
    db.task_logs.push(
      { id: "l1", task_id: "t-done", pet_id: MAX, due_at: iso(-60), status: "done", completed_at: iso(-50) },
      { id: "l2", task_id: "t-missed", pet_id: MAX, due_at: iso(-90), status: "pending", completed_at: null },
      { id: "l4", task_id: "t-grace", pet_id: MAX, due_at: iso(-20), status: "pending", completed_at: null },
      { id: "l3", task_id: "t-later", pet_id: MAX, due_at: iso(30), status: "pending", completed_at: null },
    );
    await page.reload();
    const screen = app(page);
    await expect(screen.getByTestId("care-status-t-done")).toContainText("✅ Done");
    await expect(screen.getByTestId("care-status-t-missed")).toHaveText("⚠️ Missed");
    await expect(screen.getByTestId("care-status-t-later")).toHaveText("⏳ Pending");
    // D9: 20 minutes late is still pending; missed starts after 60 minutes.
    await expect(screen.getByTestId("care-status-t-grace")).toHaveText("⏳ Pending");
  });
});
