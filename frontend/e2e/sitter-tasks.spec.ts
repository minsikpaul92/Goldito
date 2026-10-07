import { devices, expect, test } from "@playwright/test";

import { caring, mockUpload, task as fixtureTask } from "./careFixtures";
import { app, signIn } from "./helpers";
import { MockDb, OWNER, SITTER, mockSupabase } from "./supabaseMock";

// Sitter Home: today's tasks, Done popup (memo + photo), history of what is finished (phase-06 6.3).

const PET = "00000000-0000-4000-8000-0000000000aa";
const MAX = { id: PET, name: "Max", species: "dog" } as const;
const caringMax = (db: MockDb) => caring(db, [MAX]);
const task = (id: string, type: string, title: string, time: string, extra: object = {}) =>
  fixtureTask(PET, id, type, title, time, extra);

/** Sign in as the sitter and open the full task list (Home only shows the next task). */
async function openTasks(page: import("@playwright/test").Page) {
  await signIn(page, SITTER);
  await app(page).getByRole("heading", { name: "Home" }).waitFor();
  await page.goto("/sitter/tasks");
  await app(page).getByTestId("today-tasks").waitFor();
}

const firstId = async (screen: ReturnType<typeof app>, prefix: string) =>
  (await screen.locator(`[data-testid^='${prefix}']`).first().getAttribute("data-testid"))!;

test.describe("sitter today's tasks", () => {
  test("opening Home creates today's logs and shows what is next", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    caringMax(db);
    db.care_tasks.push(
      task("t-walk", "walk", "Walk", "17:00"),
      task("t-pill", "medication", "Joint pill", "20:00", { dose: "1 tablet" }),
      task("t-off", "play", "Paused play", "12:00", { active: false }),
    );
    await openTasks(page);
    const screen = app(page);

    await expect(screen.getByTestId("today-tasks")).toBeVisible();
    // exact: the "Next up: … · Joint pill" line may repeat the title (depends on the time of day).
    await expect(screen.getByText("Joint pill", { exact: true })).toBeVisible();
    expect(db.task_logs).toHaveLength(2);
    await expect(screen.getByText("Paused play")).toHaveCount(0);
    await expect(screen.getByTestId("tasks-next")).toContainText("Next up: Max");
    await expect(screen.getByTestId("tasks-count")).toHaveText("2 left · 0 done");
  });

  test("Done opens a popup; a second Done sends it, the task leaves the list, nothing goes to the feed", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    caringMax(db);
    db.care_tasks.push(task("t-meal", "feeding", "Breakfast", "08:00"));
    await openTasks(page);
    const screen = app(page);

    await screen.getByTestId(await firstId(screen, "task-done-")).click();
    await expect(screen.getByTestId("task-done-sheet")).toBeVisible();
    expect(db.taskCompletions).toHaveLength(0); // opening is not sending

    await screen.getByTestId("task-done-confirm").click();
    await expect(screen.getByTestId("toast")).toContainText("Breakfast done ✅ Robert was told");
    expect(db.taskCompletions).toEqual([{ p_task_log: db.task_logs[0].id, p_media_id: null, p_note_text: null }]);
    expect(db.notifications.filter((n) => n.type === "task_done" && n.user_id === OWNER.id)).toHaveLength(1);
    expect(db.feed_posts).toHaveLength(0);

    // It left the list; the day is wrapped up and the finished one is under "Done today".
    await expect(screen.getByTestId("task-done-sheet")).toHaveCount(0);
    await expect(screen.getByTestId("tasks-all-done")).toBeVisible();
    await expect(screen.locator("[data-testid^='task-done-']")).toHaveCount(0);
    await screen.getByTestId("tasks-done-toggle").click();
    await expect(screen.locator("[data-testid^='task-finished-']")).toContainText("Breakfast · Max");
  });

  test("a memo typed in the popup goes with what was done, not instead of it", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    caringMax(db);
    db.care_tasks.push(task("t-pill", "medication", "Joint pill", "08:00"));
    await openTasks(page);
    const screen = app(page);

    await screen.getByTestId(await firstId(screen, "task-done-")).click();
    await screen.getByTestId("task-done-memo").fill("Hid it in cheese, took it fine");
    await screen.getByTestId("task-done-confirm").click();
    await expect(screen.getByTestId("toast")).toContainText("Joint pill done ✅");

    expect(db.taskCompletions[0].p_note_text).toBe("Hid it in cheese, took it fine");
    const notice = db.notifications.find((n) => n.type === "task_done");
    expect(notice?.title).toBe("Max finished Joint pill"); // what was done
    expect(notice?.body).toBe("Hid it in cheese, took it fine"); // + the memo
  });

  test("a photo from the popup: pick, preview, then Done uploads it with the task", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    caringMax(db);
    db.care_tasks.push(task("t-walk", "walk", "Walk", "09:00"));
    const sign = await mockUpload(page, db, PET);
    await openTasks(page);
    const screen = app(page);

    await screen.getByTestId(await firstId(screen, "task-done-")).click();
    await screen.getByTestId("task-done-photo").click();
    await screen.getByTestId("sample-walk").click();
    await expect(screen.getByTestId("media-confirm-preview")).toBeVisible();
    await screen.getByTestId("media-confirm-use").click();
    await expect(screen.getByTestId("task-done-photo")).toContainText("Photo ready");
    expect(sign).toHaveLength(0); // nothing uploaded until Done

    await screen.getByTestId("task-done-confirm").click();
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
    const sign = await mockUpload(page, db, PET);
    await openTasks(page);
    const screen = app(page);
    await screen.getByTestId(await firstId(screen, "task-done-")).click();
    await screen.getByTestId("task-done-photo").click();
    await screen.getByTestId("sample-nap").click();
    await screen.getByTestId("media-confirm-retake").click();
    await expect(screen.getByTestId("media-picker")).toBeVisible();
    await expect(screen.getByTestId("media-confirm")).toHaveCount(0);
    expect(sign).toHaveLength(0);
    expect(db.taskCompletions).toHaveLength(0);
  });

  test("a failed upload shows a dialog that stays; the popup keeps the memo; Try again finishes it", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    caringMax(db);
    db.care_tasks.push(task("t-walk", "walk", "Walk", "09:00"));
    await mockUpload(page, db, PET, { failSignOnce: true });
    await openTasks(page);
    const screen = app(page);

    await screen.getByTestId(await firstId(screen, "task-done-")).click();
    await screen.getByTestId("task-done-memo").fill("Pulled on the leash");
    await screen.getByTestId("task-done-photo").click();
    await screen.getByTestId("sample-walk").click();
    await screen.getByTestId("media-confirm-use").click();
    await screen.getByTestId("task-done-confirm").click();

    await expect(screen.getByTestId("error-dialog-message")).toContainText("Could not reach Supabase");
    expect(db.taskCompletions).toHaveLength(0); // nothing half-done
    await page.waitForTimeout(3500);
    await expect(screen.getByTestId("error-dialog")).toBeVisible(); // not a toast that vanishes
    await expect(screen.getByTestId("task-done-memo")).toHaveValue("Pulled on the leash");

    await screen.getByTestId("error-dialog-retry").click();
    await expect(screen.getByTestId("toast")).toContainText("Walk done ✅");
    expect(db.taskCompletions[0]).toMatchObject({ p_media_id: "media-proof", p_note_text: "Pulled on the leash" });
  });

  test("a pet with no tasks shows a quiet empty line", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    caringMax(db);
    await openTasks(page);
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

  test("take a photo, check it, Done sends photo and task together", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    caringMax(db);
    db.care_tasks.push(task("t-walk", "walk", "Walk", "09:00"));
    const sign = await mockUpload(page, db, PET);
    // A touch phone runs the app full screen (no phone-frame iframe), so use `page` directly.
    await page.goto("/login");
    await page.getByTestId("login-email").fill(SITTER.email);
    await page.getByTestId("login-password").fill(SITTER.password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.getByRole("heading", { name: "Home" }).waitFor();
    await page.goto("/sitter/tasks");
    const screen = page;

    await screen.locator("[data-testid^='task-done-']").first().click();
    await screen.getByTestId("task-done-photo").click();
    await expect(screen.getByTestId("media-take-photo")).toBeVisible();
    await expect(screen.getByTestId("media-choose-library")).toBeVisible();
    await expect(screen.locator("[data-testid^='sample-']")).toHaveCount(0);

    const chooser = page.waitForEvent("filechooser");
    await screen.getByTestId("media-take-photo").click();
    await (await chooser).setFiles({ name: "camera.png", mimeType: "image/png", buffer: PNG });

    await expect(screen.getByTestId("media-confirm-preview")).toBeVisible();
    expect(db.taskCompletions).toHaveLength(0);
    await screen.getByTestId("media-confirm-use").click();
    await screen.getByTestId("task-done-confirm").click();
    await expect(screen.getByTestId("toast")).toContainText("Walk done ✅");
    expect(sign[0]).toMatchObject({ purpose: "task_proof", resource_type: "image" });
    expect(db.taskCompletions[0].p_media_id).toBe("media-proof");
  });
});
