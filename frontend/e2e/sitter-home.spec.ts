import { expect, test } from "@playwright/test";

import { caring, task as fixtureTask } from "./careFixtures";
import { app, petRoomOnFirstScreen, signIn } from "./helpers";
import { OWNER, SITTER, mockSupabase } from "./supabaseMock";

// Sitter Home (Figma 1730:104473): next task, Quick check-in tiles, action cards; the pixel pet room is the back side.

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
  test("shows the next task, today's count, the tiles for the pet picked, and the pixel pet room on the back", async ({ page }) => {
    await home(page);
    const screen = app(page);

    await expect(screen.getByTestId("tasks-next")).toContainText("Max · Breakfast");
    await expect(screen.getByTestId("dashboard-next")).toContainText("0 of 4 done today");
    await expect(screen.getByTestId("quick-heading")).toContainText("Quick check-in · Max");
    await expect(screen.getByTestId("tile-walk")).toBeVisible();
    await expect(screen.getByTestId(`caring-pet-${MAX.id}`)).toBeVisible();
    await expect(screen.getByTestId(`caring-pet-${MOCHI.id}`)).toBeVisible();
    // The Feed and Bookings tabs already cover those; Home keeps only the two extra links.
    await expect(screen.getByTestId("shortcut-photos")).toHaveCount(0);
    await expect(screen.getByTestId("shortcut-bookings")).toHaveCount(0);

    // A cat does not walk: its tiles have a Nap instead.
    await screen.getByTestId(`caring-pet-${MOCHI.id}`).click();
    await expect(screen.getByTestId("quick-heading")).toContainText("Quick check-in · Mochi");
    await expect(screen.getByTestId("tile-walk")).toHaveCount(0);
    await expect(screen.getByTestId("tile-nap")).toBeVisible();

    // The pixel pet room is the other side of the card.
    await screen.getByTestId("home-pager-flip").click();
    await expect(screen.getByTestId("today-caring")).toContainText("Max");
  });

  test("Complete with photo on the next task opens the sheet and moves the count", async ({ page }) => {
    const db = await home(page);
    const screen = app(page);
    await screen.getByTestId("dashboard-next-done").click();
    await expect(screen.getByTestId("task-done-sheet")).toBeVisible();
    await screen.getByTestId("task-done-confirm").click();
    await expect(screen.getByTestId("toast")).toContainText("done");
    expect(db.taskCompletions).toHaveLength(1);
    await expect(screen.getByTestId("dashboard-next")).toContainText("1 of 4 done today");
    await expect(screen.getByTestId("tasks-next")).toContainText("Max · Walk"); // the next one moved up
  });

  test("a tile opens its choices; one tap on a choice sends it", async ({ page }) => {
    const db = await home(page);
    const screen = app(page);
    await screen.getByTestId("tile-ate").click();
    await expect(screen.getByTestId("tile-options-ate")).toContainText("Ate everything");
    await expect(screen.getByTestId("tile-options-ate")).toContainText("Other");
    await screen.getByTestId("tile-option-ate-most").click();
    await expect(screen.getByTestId("toast")).toContainText("was told");
    expect(db.care_checkins.map((c) => [c.kind, c.value])).toEqual([["meal", "most"]]);
    await expect(screen.getByTestId("tile-options-ate")).toHaveCount(0);
  });

  test("two quick taps send the first choice", async ({ page }) => {
    const db = await home(page);
    const screen = app(page);
    await screen.getByTestId("tile-potty").dblclick();
    await expect(screen.getByTestId("toast")).toContainText("was told");
    expect(db.care_checkins.map((c) => [c.kind, c.value])).toEqual([["potty", "normal"]]);
  });

  test("Other needs a few words, and they are what is sent; the moods offer eight", async ({ page }) => {
    const db = await home(page);
    const screen = app(page);
    await screen.getByTestId("tile-ate").click();
    await screen.getByTestId("tile-option-ate-other").click();
    await expect(screen.getByTestId("tile-memo-send")).toBeDisabled();
    await screen.getByTestId("tile-memo-text").fill("Only ate the chicken bits");
    await screen.getByTestId("tile-memo-send").click();
    await expect(screen.getByTestId("toast")).toContainText("was told");
    expect(db.care_checkins[0]).toMatchObject({ kind: "meal", value: "other", note_text: "Only ate the chicken bits" });

    await screen.getByTestId("tile-mood").click();
    await expect(screen.locator("[data-testid^='tile-option-mood-']")).toHaveCount(8);
    await screen.getByTestId("tile-option-mood-missing").click();
    await expect(screen.getByTestId("toast")).toContainText("was told");
    expect(db.care_checkins[1]).toMatchObject({ kind: "mood", value: "missing" });
  });

  test("the action cards and links open the bigger screens", async ({ page }) => {
    await home(page);
    const screen = app(page);

    await screen.getByTestId("shortcut-tasks").click();
    await expect(page).toHaveURL(/\/sitter\/tasks$/);
    await expect(screen.getByTestId("sitter-tasks-screen")).toBeVisible();
    await page.goto("/sitter");
    await screen.getByTestId("sitter-dashboard").waitFor();

    await screen.getByTestId(`caring-pet-${MOCHI.id}`).click();
    await screen.getByTestId("action-five-second").click();
    await expect(page).toHaveURL(new RegExp(`/sitter/checkin/${MOCHI.id}$`));
    await expect(screen.getByTestId(`checkin-${MOCHI.id}`)).toBeVisible();
    await expect(screen.getByTestId("checkin-photos")).toBeVisible();

    await page.goto("/sitter");
    await screen.getByTestId("action-treat-check").click();
    await expect(page).toHaveURL(/\/sitter\/snap\/treat$/);

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
    db.daily_reports.push({ id: "r-sent", pet_id: MAX.id, sitter_id: SITTER.id, report_date: new Date(now).toISOString().slice(0, 10), body: "Max had a lovely day at the park.", status: "sent", source_snapshot: null, created_at: new Date(now - 300_000).toISOString(), sent_at: new Date(now - 300_000).toISOString() });
    db.daily_reports.push({ id: "r-draft", pet_id: MAX.id, sitter_id: SITTER.id, report_date: new Date(now).toISOString().slice(0, 10), body: "UNSENT DRAFT", status: "draft", source_snapshot: null, created_at: new Date(now).toISOString(), sent_at: null });
    await page.goto("/sitter/history");
    const screen = app(page);
    await expect(screen.getByTestId("diary-entry-report-r-sent")).toContainText("Max had a lovely day at the park."); // FB-23
    await expect(screen.getByText("UNSENT DRAFT")).toHaveCount(0);
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
