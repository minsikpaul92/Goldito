import { expect, test } from "@playwright/test";

import { caring, task as fixtureTask } from "./careFixtures";
import { app, signIn } from "./helpers";
import { OWNER, SITTER, mockSupabase } from "./supabaseMock";

// Sitter Home as a one-screen dashboard (phase 06 follow-up): numbers, next task, pets, shortcuts.

const MAX = { id: "00000000-0000-4000-8000-0000000000aa", name: "Max", species: "dog" } as const;
const MOCHI = { id: "00000000-0000-4000-8000-0000000000bb", name: "Mochi", species: "cat" } as const;
const task = (pet: { id: string }, id: string, type: string, title: string, time: string) =>
  fixtureTask(pet.id, id, type, title, time);

const MIN = 60_000;
/** Toronto wall clock "HH:MM" for an instant. */
const at = (ms: number) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: "America/Toronto", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(
    new Date(ms),
  );
const day = (ms: number) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto" }).format(new Date(ms));

async function home(page: import("@playwright/test").Page) {
  const now = Date.now();
  // Everything a few minutes ahead: nothing is due, so the dashboard shows its "Next up" card
  // whatever the time of day. (Too close to midnight the times would wrap into the past.)
  test.skip(day(now) !== day(now + 40 * MIN), "too close to midnight in Toronto");
  const { db } = await mockSupabase(page, [OWNER, SITTER]);
  caring(db, [MAX, MOCHI]);
  db.care_tasks.push(
    task(MAX, "t1", "feeding", "Breakfast", at(now + 10 * MIN)),
    task(MAX, "t2", "walk", "Walk", at(now + 20 * MIN)),
    task(MOCHI, "t3", "litter", "Litter box", at(now + 30 * MIN)),
    task(MOCHI, "t4", "medication", "Thyroid pill", at(now + 40 * MIN)),
  );
  await signIn(page, SITTER);
  await app(page).getByTestId("sitter-dashboard").waitFor();
  return db;
}

test.describe("sitter home dashboard", () => {
  test("shows today's numbers, the next task and the pets in care — and fits one screen", async ({ page }) => {
    await home(page);
    const screen = app(page);

    await expect(screen.getByTestId("stat-tasks")).toContainText("0/4");
    await expect(screen.getByTestId("stat-checkins")).toContainText("0");
    await expect(screen.getByTestId("tasks-next")).toBeVisible();
    await expect(screen.getByTestId("today-caring")).toContainText("Chloe's pets");
    // The Feed and Bookings tabs already cover those; Home keeps only the two extra shortcuts.
    await expect(screen.getByTestId("shortcut-photos")).toHaveCount(0);
    await expect(screen.getByTestId("shortcut-bookings")).toHaveCount(0);
    await expect(screen.getByTestId(`caring-pet-${MAX.id}`)).toBeVisible();
    await expect(screen.getByTestId(`caring-pet-${MOCHI.id}`)).toBeVisible();

    // No scrolling: everything is on one screen.
    const fits = await screen.getByTestId("sitter-home").evaluate((el) => el.scrollHeight <= el.clientHeight + 1);
    expect(fits).toBe(true);
  });

  test("today's tasks are listed before they are due, and one can be marked Done early", async ({ page }) => {
    const db = await home(page);
    const screen = app(page);
    await expect(screen.getByTestId("dashboard-next")).toContainText("Today · 4 to do");
    // Three rows (earliest first) and a link for the fourth.
    await expect(screen.locator("[data-testid^='today-row-']")).toHaveCount(3);
    await expect(screen.getByTestId("today-more")).toContainText("+ 1 more");
    await expect(screen.getByText("Overdue")).toHaveCount(0);

    // Not due yet, still doable now: the Walk (second row).
    const walk = screen.locator("[data-testid^='today-row-']").nth(1);
    await expect(walk).toContainText("Walk");
    await walk.getByRole("button", { name: "Done" }).click();
    await screen.getByTestId("task-done-confirm").click();
    await expect(screen.getByTestId("toast")).toContainText("done ✅");
    expect(db.taskCompletions).toHaveLength(1);
    await expect(screen.getByTestId("stat-tasks")).toContainText("1/4");
    await expect(screen.locator("[data-testid^='today-row-']")).toHaveCount(3); // the fourth moved up
  });

  test("Done on the next-task card opens the popup and updates the numbers", async ({ page }) => {
    const db = await home(page);
    const screen = app(page);
    await screen.getByTestId("dashboard-next-done").click();
    await expect(screen.getByTestId("task-done-sheet")).toBeVisible();
    await screen.getByTestId("task-done-confirm").click();
    await expect(screen.getByTestId("toast")).toContainText("done ✅");
    expect(db.taskCompletions).toHaveLength(1);
    await expect(screen.getByTestId("stat-tasks")).toContainText("1/4");
  });

  test("shortcuts open the bigger screens; a pet chip opens its check-in", async ({ page }) => {
    await home(page);
    const screen = app(page);

    await screen.getByTestId("shortcut-tasks").click();
    await expect(page).toHaveURL(/\/sitter\/tasks$/);
    await expect(screen.getByTestId("sitter-tasks-screen")).toBeVisible();
    await page.goto("/sitter");
    await screen.getByTestId("sitter-dashboard").waitFor();

    await screen.getByTestId(`caring-pet-${MOCHI.id}`).click();
    await expect(page).toHaveURL(new RegExp(`/sitter/checkin/${MOCHI.id}$`));
    await expect(screen.getByTestId(`checkin-${MOCHI.id}`)).toBeVisible();
    await expect(screen.getByTestId("checkin-photos")).toBeVisible();

    await page.goto("/sitter");
    await screen.getByTestId("shortcut-history").click();
    await expect(page).toHaveURL(/\/sitter\/history$/);
  });

  test("My history lists what was finished and sent, newest first, with the pet's name", async ({ page }) => {
    const db = await home(page);
    const now = Date.now();
    db.task_logs.push({
      id: "l-done",
      task_id: "t1",
      pet_id: MAX.id,
      due_at: new Date(now - 3_600_000).toISOString(),
      status: "done",
      completed_at: new Date(now - 3_000_000).toISOString(),
      completed_by: SITTER.id,
      media_id: null,
      note_text: null,
    });
    db.care_checkins.push({
      id: "c1",
      pet_id: MOCHI.id,
      created_by: SITTER.id,
      kind: "mood",
      value: "calm",
      note_text: "Purred on my lap",
      media_id: null,
      created_at: new Date(now - 600_000).toISOString(),
    });
    await page.goto("/sitter/history");
    const screen = app(page);
    await expect(screen.getByText("Mood · Calm")).toBeVisible();
    await expect(screen.getByText("Purred on my lap")).toBeVisible();
    await expect(screen.getByText("Breakfast · Done")).toBeVisible();
    const ids = await screen
      .locator("[data-testid^='diary-entry-']")
      .evaluateAll((els) => els.map((e) => e.getAttribute("data-testid")));
    // Newest first: the check-in (10 min ago) comes before the finished task (50 min ago). Tasks
    // that went past their time without being done are listed too (⚠️ Missed).
    expect(ids.indexOf("diary-entry-checkin-c1")).toBeGreaterThanOrEqual(0);
    expect(ids.indexOf("diary-entry-checkin-c1")).toBeLessThan(ids.indexOf("diary-entry-task-l-done"));
    await expect(screen.getByTestId("diary-entry-checkin-c1")).toContainText("Mochi");
  });
});
