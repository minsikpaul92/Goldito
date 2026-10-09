import { expect, test } from "@playwright/test";

import { caring, mockUpload } from "./careFixtures";
import { NOON_TORONTO, TODAY_TORONTO, app, signIn } from "./helpers";
import { OWNER, SITTER, mockSupabase } from "./supabaseMock";

// Daily report (phase-07 7.3): the sitter keeps or turns off chips, adds a note, edits the AI preview and sends;
// the owner reads only what was sent. The AI endpoints are mocked (the real ones are covered by pytest).

const MAX = { id: "00000000-0000-4000-8000-0000000000aa", name: "Max", species: "dog" } as const;
const CHIPS = [
  { id: "rec-meal", kind: "record", label: "Ate everything", source: "checkin", check: "meal", value: "all", media_id: null },
  { id: "rec-walk", kind: "record", label: "Walk · 20 min", source: "checkin", check: "walk", value: "20", media_id: null },
  { id: "note-c-note", kind: "episode", label: "Met a golden retriever", source: "checkin", check: null, media_id: null },
  { id: "feed-f-park", kind: "episode", label: "Zoomies at the park", source: "feed", check: null, media_id: null },
];
const PHOTO_CHIP = { id: "photo-media-proof-0", kind: "episode", label: "Watching a squirrel", source: "vision", check: null, media_id: "media-proof" };
const PHOTO_CHIP_2 = { id: "photo-media-proof-1", kind: "episode", label: "Park walk", source: "vision", check: null, media_id: "media-proof" };

async function openSitterDiary(page: import("@playwright/test").Page) {
  // A fixed clock before the first navigation: "today" is a Toronto date, so it must not depend on when CI runs.
  await page.clock.setFixedTime(NOON_TORONTO);
  const { db } = await mockSupabase(page, [OWNER, SITTER], { now: NOON_TORONTO });
  caring(db, [MAX], NOON_TORONTO);
  const chipRequests: Record<string, unknown>[] = [];
  const reportRequests: Record<string, unknown>[] = [];
  await page.route("**/api/ai/report-chips", (route) => {
    const body = route.request().postDataJSON();
    chipRequests.push(body);
    const withPhoto = (body.media_ids as string[]).length > 0;
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        summary: { tasks_done: 2, tasks_missed: 1, checkins: 4 },
        chips: withPhoto ? [...CHIPS, PHOTO_CHIP, PHOTO_CHIP_2] : CHIPS,
        photos: withPhoto ? [{ media_id: "media-proof", description: "Max looking up at a squirrel" }] : [],
      }),
    });
  });
  await page.route("**/api/ai/daily-report", (route) => {
    reportRequests.push(route.request().postDataJSON());
    const row = {
      id: "r1",
      pet_id: MAX.id,
      sitter_id: SITTER.id,
      report_date: TODAY_TORONTO,
      body: "I had such a lovely day with Max! 🐶 He ate everything.",
      status: "draft",
      source_snapshot: { tasks: [{ title: "Walk", status: "done" }] },
      created_at: NOON_TORONTO.toISOString(),
    };
    db.daily_reports.push(row);
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ report_id: "r1", body: row.body, status: "draft", model: "m", latency_ms: 1 }),
    });
  });
  await signIn(page, SITTER);
  await app(page).getByRole("heading", { name: "Home" }).waitFor();
  await page.goto("/sitter/diary");
  await app(page).getByTestId(`report-${MAX.id}`).waitFor();
  return { db, chipRequests, reportRequests };
}

test.describe("daily report", () => {
  test("chips on and off → Write the report → edit the preview → Send; the owner is told", async ({ page }) => {
    const { db, reportRequests } = await openSitterDiary(page);
    const screen = app(page);
    const chip = (id: string) => screen.getByTestId(`report-chip-${MAX.id}-${id}`);

    await expect(chip("rec-meal")).toHaveAttribute("aria-pressed", "true");
    await chip("rec-walk").click();
    await expect(chip("rec-walk")).toHaveAttribute("aria-pressed", "false");
    await screen.getByTestId(`report-note-${MAX.id}`).fill("She got so excited");
    await screen.getByTestId(`report-generate-${MAX.id}`).click();

    await expect(screen.getByTestId(`report-body-${MAX.id}`)).toHaveValue(/lovely day with Max/);
    // The walk chip was off → "walk" is skipped; only episode chips go as chips; the note rides along.
    expect(reportRequests[0]).toMatchObject({
      pet_id: MAX.id,
      chips: ["Met a golden retriever", "Zoomies at the park"],
      sitter_note: "She got so excited",
      photos: [],
      skip: ["walk"],
      off: [],
    });
    // Nothing is visible to the owner before Send.
    expect(db.daily_reports[0].status).toBe("draft");

    await screen.getByTestId(`report-body-${MAX.id}`).fill("Max had a great day! 🐶");
    await screen.getByTestId(`report-send-${MAX.id}`).click();
    await expect(screen.getByTestId("toast")).toContainText("Sent ✅ Robert was told");
    await expect(screen.getByTestId(`report-sent-${MAX.id}`)).toContainText("Sent to Robert");
    expect(db.daily_reports[0]).toMatchObject({ status: "sent", body: "Max had a great day! 🐶" });
    expect(db.notifications.find((n) => n.type === "report_sent")?.ref_id).toBe("r1");
  });

  test("a photo adds its description and chips; turning its chips off leaves the photo out", async ({ page }) => {
    const { db, chipRequests, reportRequests } = await openSitterDiary(page);
    await mockUpload(page, db, MAX.id);
    const screen = app(page);

    await screen.getByTestId(`report-add-photo-${MAX.id}`).click();
    await screen.getByTestId("sample-walk").click();
    await screen.getByTestId("media-confirm-use").click();
    await expect(screen.getByTestId(`report-chip-${MAX.id}-${PHOTO_CHIP.id}`)).toBeVisible();
    expect(chipRequests.at(-1)).toMatchObject({ pet_id: MAX.id, media_ids: ["media-proof"] });

    await screen.getByTestId(`report-generate-${MAX.id}`).click();
    await screen.getByTestId(`report-body-${MAX.id}`).waitFor();
    expect(reportRequests[0]).toMatchObject({
      chips: ["Met a golden retriever", "Zoomies at the park", "Watching a squirrel", "Park walk"],
      photos: ["Max looking up at a squirrel"],
    });

    // One of the photo's two chips off: its description could say the same thing, so it stays home too.
    await screen.getByTestId(`report-back-${MAX.id}`).click();
    await screen.getByTestId(`report-chip-${MAX.id}-${PHOTO_CHIP.id}`).click();
    await screen.getByTestId(`report-generate-${MAX.id}`).click();
    await screen.getByTestId(`report-body-${MAX.id}`).waitFor();
    expect(reportRequests[1]).toMatchObject({ chips: ["Met a golden retriever", "Zoomies at the park", "Park walk"], photos: [] });
  });

  test("a turned-off note or photo chip is sent as `off`, so the server leaves that record out", async ({ page }) => {
    const { reportRequests } = await openSitterDiary(page);
    const screen = app(page);
    await screen.getByTestId(`report-chip-${MAX.id}-note-c-note`).click();
    await screen.getByTestId(`report-chip-${MAX.id}-feed-f-park`).click();
    await screen.getByTestId(`report-chip-${MAX.id}-rec-walk`).click();
    await screen.getByTestId(`report-generate-${MAX.id}`).click();
    await screen.getByTestId(`report-body-${MAX.id}`).waitFor();
    expect(reportRequests[0]).toMatchObject({ chips: [], skip: ["walk"] });
    expect([...(reportRequests[0].off as string[])].sort()).toEqual(["feed-f-park", "note-c-note"]);
  });

  test("the owner's Diary lists only sent reports and opens one read-only", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    caring(db, [MAX]);
    db.daily_reports.push(
      { id: "sent1", pet_id: MAX.id, sitter_id: SITTER.id, report_date: "2026-10-05", body: "A calm day. Max napped a lot! Then we walked.", status: "sent", sent_at: "2026-10-05T22:00:00Z", source_snapshot: { tasks: [{ title: "Walk", status: "done" }, { title: "Pill", status: "missed" }] }, created_at: "2026-10-05T22:00:00Z" },
      { id: "draft1", pet_id: MAX.id, sitter_id: SITTER.id, report_date: "2026-10-06", body: "SECRET DRAFT", status: "draft", source_snapshot: null, created_at: "2026-10-06T22:00:00Z" },
    );
    await signIn(page, OWNER);
    await app(page).getByRole("heading", { name: "Home" }).waitFor();
    await page.goto("/owner/diary");
    const screen = app(page);
    await expect(screen.getByTestId("diary-report-sent1")).toContainText("A calm day.");
    await expect(screen.getByTestId("diary-report-sent1")).toContainText("Max · Chloe");
    await expect(screen.getByText("SECRET DRAFT")).toHaveCount(0);

    await screen.getByTestId("diary-report-sent1").click();
    await expect(screen.getByTestId("diary-entry-body")).toContainText("Then we walked.");
    await expect(screen.getByText("✓ Walk")).toBeVisible();
    await expect(screen.getByText("Pill · missed")).toBeVisible();
  });

  test("the top line sums up the day, and a recorded value can be corrected before the report is written", async ({ page }) => {
    const { reportRequests } = await openSitterDiary(page);
    const screen = app(page);
    await expect(screen.getByTestId(`report-summary-${MAX.id}`)).toHaveText("Today: 2 tasks done · 1 missed · 4 check-ins");

    await screen.getByTestId(`report-edit-${MAX.id}`).click();
    await screen.getByTestId(`report-edit-${MAX.id}-meal-most`).click();
    await screen.getByTestId(`report-edit-${MAX.id}-walk-30`).click();
    await screen.getByTestId(`report-edit-done-${MAX.id}`).click();
    await expect(screen.getByRole("button", { name: "Meal: Most: on" })).toBeVisible();
    await expect(screen.getByRole("button", { name: "Walk: 30 min: on" })).toBeVisible();

    // Turning the corrected walk chip off drops its correction too.
    await screen.getByRole("button", { name: "Walk: 30 min: on" }).click();
    await screen.getByTestId(`report-generate-${MAX.id}`).click();
    await screen.getByTestId(`report-body-${MAX.id}`).waitFor();
    expect(reportRequests[0]).toMatchObject({ skip: ["walk"], overrides: { meal: "most" } });
  });

  test("+ Add makes the sitter's own chip; it goes to the report like an episode chip and can be turned off", async ({ page }) => {
    const { reportRequests } = await openSitterDiary(page);
    const screen = app(page);
    await screen.getByTestId(`report-custom-${MAX.id}`).click();
    await screen.getByTestId(`report-custom-add-${MAX.id}`).waitFor();
    await expect(screen.getByTestId(`report-custom-add-${MAX.id}`)).toBeDisabled();
    await screen.getByTestId(`report-custom-input-${MAX.id}`).fill("Learned a new trick");
    await screen.getByTestId(`report-custom-add-${MAX.id}`).click();
    const chip = screen.getByRole("button", { name: "Learned a new trick: on" });
    await expect(chip).toBeVisible();

    await screen.getByTestId(`report-generate-${MAX.id}`).click();
    await screen.getByTestId(`report-body-${MAX.id}`).waitFor();
    expect(reportRequests[0]).toMatchObject({ chips: ["Met a golden retriever", "Zoomies at the park", "Learned a new trick"] });

    await screen.getByTestId(`report-back-${MAX.id}`).click();
    await screen.getByRole("button", { name: "Learned a new trick: on" }).click();
    await screen.getByTestId(`report-generate-${MAX.id}`).click();
    await screen.getByTestId(`report-body-${MAX.id}`).waitFor();
    expect(reportRequests[1]).toMatchObject({ chips: ["Met a golden retriever", "Zoomies at the park"] });
  });

  test("a saved draft comes back after a reload, still private", async ({ page }) => {
    const { db } = await openSitterDiary(page);
    db.daily_reports.push({ id: "d1", pet_id: MAX.id, sitter_id: SITTER.id, report_date: TODAY_TORONTO, body: "Saved draft text", status: "draft", source_snapshot: null, created_at: NOON_TORONTO.toISOString() });
    await page.reload();
    const screen = app(page);
    await expect(screen.getByTestId(`report-body-${MAX.id}`)).toHaveValue("Saved draft text");
    await expect(screen.getByTestId(`report-send-${MAX.id}`)).toBeEnabled();
  });

  test("an owner with no reports sees the empty state", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    caring(db, [MAX]);
    await signIn(page, OWNER);
    await app(page).getByRole("heading", { name: "Home" }).waitFor();
    await page.goto("/owner/diary");
    await expect(app(page).getByText("When a stay is on, updates show up here live", { exact: false })).toBeVisible();
  });
});
