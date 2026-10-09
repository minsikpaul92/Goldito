import { expect, test } from "@playwright/test";

import { caring, mockUpload } from "./careFixtures";
import { NOON_TORONTO, TODAY_TORONTO, app, signIn } from "./helpers";
import { OWNER, SITTER, mockSupabase } from "./supabaseMock";

// Daily report (phase-07 7.3): the sitter keeps or turns off chips, adds a note, edits the AI preview and sends;
// the owner reads only what was sent. The AI endpoints are mocked (the real ones are covered by pytest).

const MAX = { id: "00000000-0000-4000-8000-0000000000aa", name: "Max", species: "dog" } as const;
const MOCHI = { id: "00000000-0000-4000-8000-0000000000bb", name: "Mochi", species: "cat" } as const;
const CHIPS = [
  { id: "rec-meal", kind: "record", label: "Ate everything", source: "checkin", check: "meal", value: "all", media_id: null },
  { id: "rec-walk", kind: "record", label: "Walk · 20 min", source: "checkin", check: "walk", value: "20", media_id: null },
  { id: "note-c-note", kind: "episode", label: "Met a golden retriever", source: "checkin", check: null, media_id: null },
  { id: "feed-f-park", kind: "episode", label: "Zoomies at the park", source: "feed", check: null, media_id: null },
];
const PHOTO_CHIP = { id: "photo-media-proof-0", kind: "episode", label: "Watching a squirrel", source: "vision", check: null, media_id: "media-proof" };
const PHOTO_CHIP_2 = { id: "photo-media-proof-1", kind: "episode", label: "Park walk", source: "vision", check: null, media_id: "media-proof" };

async function openSitterDiary(page: import("@playwright/test").Page, extraChips: typeof CHIPS = [], pets: (typeof MAX | typeof MOCHI)[] = [MAX]) {
  // A fixed clock before the first navigation: "today" is a Toronto date, so it must not depend on when CI runs.
  await page.clock.setFixedTime(NOON_TORONTO);
  const { db } = await mockSupabase(page, [OWNER, SITTER], { now: NOON_TORONTO });
  caring(db, pets, NOON_TORONTO);
  const chipRequests: Record<string, unknown>[] = [];
  const reportRequests: Record<string, unknown>[] = [];
  /** What the chips endpoint answers; a test may add to it (something recorded meanwhile). */
  const served = [...CHIPS, ...extraChips];
  await page.route("**/api/ai/report-chips", (route) => {
    const body = route.request().postDataJSON();
    chipRequests.push(body);
    const withPhoto = (body.media_ids as string[]).length > 0;
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        summary: { tasks_done: 2, tasks_missed: 1, checkins: 4 },
        chips: [...served, ...(withPhoto ? [PHOTO_CHIP, PHOTO_CHIP_2] : [])],
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
  return { db, chipRequests, reportRequests, served };
}

test.describe("daily report", () => {
  test("chips on and off → Write the report → edit the preview → Send; the owner is told", async ({ page }) => {
    const { db, reportRequests } = await openSitterDiary(page);
    const screen = app(page);
    const chip = (id: string) => screen.getByTestId(`report-chip-${MAX.id}-${id}`);

    await expect(chip("rec-meal")).toHaveAttribute("aria-pressed", "true");
    await chip("rec-walk").click();
    await expect(chip("rec-walk")).toHaveAttribute("aria-pressed", "false");
    for (const line of ["She got so excited", "Napped on my lap"]) {
      await screen.getByTestId(`report-custom-input-${MAX.id}`).fill(line);
      await screen.getByTestId(`report-custom-add-${MAX.id}`).click();
    }
    await screen.getByTestId(`report-generate-${MAX.id}`).click();

    await expect(screen.getByTestId(`report-body-${MAX.id}`)).toHaveValue(/lovely day with Max/);
    // The walk chip was off → "walk" is skipped; only episode chips go as chips; the sitter's lines go first (FB-18).
    expect(reportRequests[0]).toMatchObject({
      pet_id: MAX.id,
      chips: ["She got so excited", "Napped on my lap", "Met a golden retriever", "Zoomies at the park"],
      sitter_note: null,
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
      chips: ["Met a golden retriever", "Watching a squirrel", "Park walk", "Zoomies at the park"], // notes, photos, then the feed
      photos: ["Max looking up at a squirrel"],
    });

    // One of the photo's two chips off: its description could say the same thing, so it stays home too.
    await screen.getByTestId(`report-back-${MAX.id}`).click();
    await screen.getByTestId(`report-chip-${MAX.id}-${PHOTO_CHIP.id}`).click();
    await screen.getByTestId(`report-generate-${MAX.id}`).click();
    await screen.getByTestId(`report-body-${MAX.id}`).waitFor();
    expect(reportRequests[1]).toMatchObject({ chips: ["Met a golden retriever", "Park walk", "Zoomies at the park"], photos: [] });
  });

  test("more than 8 highlights on: a hint says only 8 go in, and the report is still written", async ({ page }) => {
    const notes = Array.from({ length: 7 }, (_, i) => ({ id: `note-c${i}`, kind: "episode", label: `Moment ${i}`, source: "checkin", check: null, media_id: null }));
    const { reportRequests } = await openSitterDiary(page, notes);
    const screen = app(page);
    await expect(screen.getByTestId(`report-too-many-${MAX.id}`)).toHaveText("Only 8 highlights go into the report — turn a few off to choose.");
    await screen.getByTestId(`report-generate-${MAX.id}`).click();
    await expect(screen.getByTestId(`report-body-${MAX.id}`)).toHaveValue(/lovely day with Max/);
    expect((reportRequests[0].chips as string[]).length).toBe(9);
    expect(reportRequests[0].chips).toEqual(["Met a golden retriever", ...notes.map((n) => n.label), "Zoomies at the park"]);

    await screen.getByTestId(`report-back-${MAX.id}`).click();
    await screen.getByTestId(`report-chip-${MAX.id}-note-c0`).click(); // back to 8: no hint
    await expect(screen.getByTestId(`report-too-many-${MAX.id}`)).toHaveCount(0);
  });

  test("a refused request (422) says what to do, not \"check your connection\"", async ({ page }) => {
    await openSitterDiary(page);
    await page.route("**/api/ai/daily-report", (route) => route.fulfill({ status: 422, contentType: "application/json", body: JSON.stringify({ detail: [] }) }));
    const screen = app(page);
    await screen.getByTestId(`report-generate-${MAX.id}`).click();
    await expect(screen.getByText("Too many highlights — turn a few off and try again.")).toBeVisible();
  });

  test("the writing helper is down: a plain-list draft with a notice, and it can still be sent", async ({ page }) => {
    const { db } = await openSitterDiary(page);
    const plain = "Hi Max's family! Here's Max's day:\n• Ate everything\n• Met a golden retriever";
    await page.route("**/api/ai/daily-report", (route) => {
      db.daily_reports.push({ id: "r1", pet_id: MAX.id, sitter_id: SITTER.id, report_date: TODAY_TORONTO, body: plain, status: "draft", source_snapshot: null, created_at: NOON_TORONTO.toISOString() });
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ report_id: "r1", body: plain, status: "draft", model: "template-fallback", latency_ms: 0, fallback: true }),
      });
    });
    const screen = app(page);
    await screen.getByTestId(`report-generate-${MAX.id}`).click();
    await expect(screen.getByTestId(`report-fallback-${MAX.id}`)).toHaveText("The writing helper is down — here's a plain list. Edit it if you like, then send.");
    await expect(screen.getByTestId(`report-body-${MAX.id}`)).toHaveValue(plain);
    await screen.getByTestId(`report-send-${MAX.id}`).click();
    await expect(screen.getByTestId(`report-sent-${MAX.id}`)).toContainText("Sent to Robert");
    expect(db.daily_reports[0]).toMatchObject({ status: "sent", body: plain });
  });

  test("a written draft shows no plain-list notice", async ({ page }) => {
    await openSitterDiary(page);
    const screen = app(page);
    await screen.getByTestId(`report-generate-${MAX.id}`).click();
    await expect(screen.getByTestId(`report-body-${MAX.id}`)).toHaveValue(/lovely day with Max/);
    await expect(screen.getByTestId(`report-fallback-${MAX.id}`)).toHaveCount(0);
  });

  test("changing your mind: clearing the line adds nothing, and × removes a line you added (FB-16, FB-17)", async ({ page }) => {
    const { reportRequests } = await openSitterDiary(page);
    const screen = app(page);
    const input = screen.getByTestId(`report-custom-input-${MAX.id}`);
    await input.fill("Typo here");
    await input.fill("");
    await expect(screen.getByTestId(`report-custom-add-${MAX.id}`)).toBeDisabled();
    for (const line of ["Loved the squirrels", "Slept all afternoon"]) {
      await input.fill(line);
      await input.press("Enter");
    }
    await screen.getByRole("button", { name: "Remove Loved the squirrels" }).click();
    await expect(screen.getByRole("button", { name: /Loved the squirrels/ })).toHaveCount(0);
    // A suggested chip has no ×: it is only turned off (D38).
    await expect(screen.getByRole("button", { name: "Remove Met a golden retriever" })).toHaveCount(0);
    await screen.getByTestId(`report-generate-${MAX.id}`).click();
    await screen.getByTestId(`report-body-${MAX.id}`).waitFor();
    expect(reportRequests[0]).toMatchObject({ chips: ["Slept all afternoon", "Met a golden retriever", "Zoomies at the park"] });
  });

  test("two pets in care: pick the pet first, write for that one; each keeps its own lines (FB-19)", async ({ page }) => {
    const { reportRequests } = await openSitterDiary(page, [], [MAX, MOCHI]);
    const screen = app(page);
    await expect(screen.getByTestId(`diary-pet-${MAX.id}`)).toHaveAttribute("aria-pressed", "true");
    await expect(screen.getByTestId(`report-${MAX.id}`)).toBeVisible();
    await expect(screen.getByTestId(`report-${MOCHI.id}`)).toBeHidden();

    await screen.getByTestId(`report-custom-input-${MAX.id}`).fill("Max line");
    await screen.getByTestId(`report-custom-add-${MAX.id}`).click();
    await screen.getByTestId(`diary-pet-${MOCHI.id}`).click();
    await expect(screen.getByTestId(`report-${MOCHI.id}`)).toBeVisible();
    await expect(screen.getByTestId(`report-${MAX.id}`)).toBeHidden();
    await screen.getByTestId(`report-generate-${MOCHI.id}`).click();
    await screen.getByTestId(`report-body-${MOCHI.id}`).waitFor();
    expect(reportRequests[0]).toMatchObject({ pet_id: MOCHI.id });
    expect(reportRequests[0].chips).not.toContain("Max line");
    await expect(screen.getByTestId(`diary-pet-${MOCHI.id}`)).toContainText("Draft");

    await screen.getByTestId(`diary-pet-${MAX.id}`).click();
    await expect(screen.getByRole("button", { name: "Max line: on" })).toBeVisible(); // still there
  });

  test("one pet in care: no picker", async ({ page }) => {
    await openSitterDiary(page);
    await expect(app(page).getByTestId(`diary-pet-${MAX.id}`)).toHaveCount(0);
  });

  test("coming back to the Diary shows what was recorded meanwhile; a chip turned off stays off", async ({ page }) => {
    const { served, chipRequests } = await openSitterDiary(page);
    const screen = app(page);
    const chip = (id: string) => screen.getByTestId(`report-chip-${MAX.id}-${id}`);
    await chip("rec-walk").click();
    await expect(chip("rec-walk")).toHaveAttribute("aria-pressed", "false");

    await screen.getByRole("tab", { name: /Home/ }).click();
    served.push({ id: "note-c-new", kind: "episode", label: "Threw up a little", source: "checkin", check: null, media_id: null });
    await screen.getByRole("tab", { name: /Diary/ }).click();

    await expect(chip("note-c-new")).toBeVisible();
    await expect(chip("rec-walk")).toHaveAttribute("aria-pressed", "false");
    expect(chipRequests.at(-1)).toMatchObject({ media_ids: [] }); // a quiet refresh: no photo is read again
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

  test("a line in \"Anything to add?\" becomes the sitter's own chip; it goes to the report and can be turned off", async ({ page }) => {
    const { reportRequests } = await openSitterDiary(page);
    const screen = app(page);
    await expect(screen.getByTestId(`report-custom-add-${MAX.id}`)).toBeDisabled();
    await screen.getByTestId(`report-custom-input-${MAX.id}`).fill("Learned a new trick");
    await screen.getByTestId(`report-custom-add-${MAX.id}`).click();
    const chip = screen.getByRole("button", { name: "Learned a new trick: on" });
    await expect(chip).toBeVisible();
    await expect(screen.getByTestId(`report-custom-input-${MAX.id}`)).toHaveValue(""); // ready for the next line

    await screen.getByTestId(`report-generate-${MAX.id}`).click();
    await screen.getByTestId(`report-body-${MAX.id}`).waitFor();
    expect(reportRequests[0]).toMatchObject({ chips: ["Learned a new trick", "Met a golden retriever", "Zoomies at the park"] }); // the sitter's own first

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
