import { expect, test } from "@playwright/test";

import { caring, task as fixtureTask } from "./careFixtures";
import { app, signIn } from "./helpers";
import { OWNER, SITTER, mockSupabase } from "./supabaseMock";

// In-app due reminder on sitter Home (phase-06 6.6, D17): banner + one toast per newly due task.

const MAX = { id: "00000000-0000-4000-8000-0000000000aa", name: "Max", species: "dog" } as const;
const MOCHI = { id: "00000000-0000-4000-8000-0000000000bb", name: "Mochi", species: "cat" } as const;
const MIN = 60_000;

/** Toronto wall clock "HH:MM" for an instant (the task times are in the app timezone). */
const torontoTime = (ms: number) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: "America/Toronto", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(
    new Date(ms),
  );
const torontoDay = (ms: number) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto" }).format(new Date(ms));

test("a banner for what is due now, a toast when the next one becomes due, then overdue ones", async ({ page }) => {
  const now = Date.now();
  // Task times are "today" in Toronto; stay clear of midnight so all three fall on the same day.
  test.skip(torontoDay(now - 130 * MIN) !== torontoDay(now + 6 * MIN), "too close to midnight in Toronto");

  const { db } = await mockSupabase(page, [OWNER, SITTER]);
  caring(db, [MAX, MOCHI]);
  const t = (id: string, title: string, at: number) => fixtureTask(MAX.id, id, "feeding", title, torontoTime(at));
  db.care_tasks.push(
    t("t-old", "Early meal", now - 130 * MIN), // more than an hour late → overdue
    t("t-due", "Lunch", now - 5 * MIN), // due now
    t("t-soon", "Snack", now + 3 * MIN), // becomes due while the app is open
  );

  await page.clock.install({ time: now });
  await signIn(page, SITTER);
  const screen = app(page);
  await screen.getByTestId("due-banner").waitFor();

  // First look: the banner shows what is due (not the overdue one), and no toast floods in.
  await expect(screen.getByTestId("due-banner-label")).toHaveText("⏰ Due now");
  await expect(screen.getByTestId("due-banner-title")).toContainText("Lunch");
  await expect(screen.getByText("+ 1 more waiting", { exact: false })).toBeVisible();
  await expect(screen.getByTestId("toast")).toHaveCount(0);
  // The banner takes the place of "Next up": Home still fits one screen, even with two pets.
  expect(await screen.getByTestId("sitter-home").evaluate((el) => el.scrollHeight <= el.clientHeight + 1)).toBe(true);
  await expect(screen.getByTestId("dashboard-next")).toHaveCount(0);

  // Four minutes pass with the app open: Snack becomes due → one toast.
  await page.clock.fastForward("04:00");
  await expect(screen.getByTestId("toast")).toContainText("⏰ Time for Snack · Max");
  await expect(screen.getByText("+ 2 more waiting", { exact: false })).toBeVisible();

  // Done on the banner finishes Lunch; the banner moves on to Snack.
  await screen.getByTestId("due-banner-done").click();
  await screen.getByTestId("task-done-confirm").click();
  await expect(screen.getByTestId("due-banner-title")).toContainText("Snack");

  // Dismiss Snack: only the overdue one is left, and it says so.
  await screen.getByTestId("due-banner-dismiss").click();
  await expect(screen.getByTestId("due-banner-label")).toHaveText("⚠️ Overdue");
  await expect(screen.getByTestId("due-banner-title")).toContainText("Early meal");

  // Dismissing the last one clears the banner.
  await screen.getByTestId("due-banner-dismiss").click();
  await expect(screen.getByTestId("due-banner")).toHaveCount(0);
});

test("nothing due, no banner", async ({ page }) => {
  const now = Date.now();
  test.skip(torontoDay(now) !== torontoDay(now + 20 * MIN), "too close to midnight in Toronto");
  const { db } = await mockSupabase(page, [OWNER, SITTER]);
  caring(db, [MAX]);
  db.care_tasks.push(fixtureTask(MAX.id, "t-later", "feeding", "Dinner", torontoTime(now + 20 * MIN)));
  await signIn(page, SITTER);
  await app(page).getByTestId("sitter-dashboard").waitFor();
  await expect(app(page).getByTestId("tasks-next")).toContainText("Dinner");
  await expect(app(page).getByTestId("due-banner")).toHaveCount(0);
});

test("Remind me in 10 min hides the banner, survives a refresh, and brings it back with a toast", async ({ page }) => {
  const now = Date.now();
  test.skip(torontoDay(now - 5 * MIN) !== torontoDay(now + 20 * MIN), "too close to midnight in Toronto");
  const { db } = await mockSupabase(page, [OWNER, SITTER]);
  caring(db, [MAX]);
  db.care_tasks.push(fixtureTask(MAX.id, "t-due", "feeding", "Dinner", torontoTime(now - 5 * MIN)));

  await page.clock.install({ time: now });
  await signIn(page, SITTER);
  const screen = app(page);
  await expect(screen.getByTestId("due-banner-title")).toContainText("Dinner");

  await screen.getByTestId("due-banner-snooze").click();
  await expect(screen.getByTestId("due-banner")).toHaveCount(0);

  // A refresh doesn't forget the snooze.
  await page.reload();
  await screen.getByTestId("sitter-dashboard").waitFor();
  await expect(screen.getByTestId("due-banner")).toHaveCount(0);

  // 9 minutes in: still snoozed. 11 minutes in: it is back, with a toast.
  await page.clock.fastForward("09:00");
  await expect(screen.getByTestId("due-banner")).toHaveCount(0);
  await page.clock.fastForward("02:00");
  await expect(screen.getByTestId("toast")).toContainText("⏰ Still waiting: Dinner · Max");
  await expect(screen.getByTestId("due-banner-title")).toContainText("Dinner");
});
