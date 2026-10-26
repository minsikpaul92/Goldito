import { expect, test } from "@playwright/test";

import { app, signIn } from "./helpers";
import { MockDb, OWNER, SITTER, mockSupabase } from "./supabaseMock";

// Handoff check (phase-03b 3B.6): Received from 2 h before drop-off, then Returned.

const BOOKING = "00000000-0000-4000-8000-0000000000e1";
const MAX = "00000000-0000-4000-8000-0000000000c1";
const HOUR = 3_600_000;

/** A confirmed stay whose drop-off is `dropInMs` from now. */
function seed(db: MockDb, dropInMs: number) {
  db.pets.push({ id: MAX, owner_id: OWNER.id, species: "dog", name: "Max", breed: null, notes: null });
  db.bookings.push({
    id: BOOKING,
    owner_id: OWNER.id,
    sitter_id: SITTER.id,
    status: "confirmed",
    service_type: "boarding",
    meet_greet_status: "done",
    created_at: "2026-10-02T18:00:00Z",
  });
  db.booking_pets.push({ booking_id: BOOKING, pet_id: MAX });
  const now = Date.now();
  for (const [kind, at] of [
    ["drop_off", now + dropInMs],
    ["pick_up", now + dropInMs + 72 * HOUR],
  ] as const) {
    db.booking_handoffs.push({
      id: `h-${kind}`,
      booking_id: BOOKING,
      kind,
      scheduled_at: new Date(at).toISOString(),
      location_type: "sitter_home",
      location_note: null,
      within_sitter_hours: true,
      status: "agreed",
      proposed_by: OWNER.id,
      completed_at: null,
      created_at: "2026-10-02T18:00:00Z",
    });
  }
}

test.describe("handoff check", () => {
  test("Received, then Returned, from the sitter's booking", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    seed(db, HOUR);
    const lifeRecordAsked: Record<string, unknown>[] = [];
    await page.route("**/api/ai/life-record", (route) => {
      lifeRecordAsked.push(route.request().postDataJSON());
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ records: [] }) });
    });
    await signIn(page, SITTER);
    await expect(page).toHaveURL(/\/sitter$/);
    await page.goto(`/sitter/bookings/${BOOKING}`);
    const screen = app(page);

    await expect(screen.getByTestId("handoff-returned")).toHaveCount(0);
    await screen.getByTestId("handoff-received").click();
    await expect(screen.getByTestId("toast")).toContainText("Max checked in. Robert gets a notice");
    expect(db.completions).toEqual([{ p_booking: BOOKING, p_kind: "drop_off" }]);
    await expect(screen.getByTestId("handoff-drop_off")).toContainText("✓ Received");
    await expect(screen.getByText("In care", { exact: true })).toBeVisible(); // FB-26

    // FB-9: Returned asks first. The pick-up is days away, so the sheet also asks "really?"; Cancel changes nothing.
    await screen.getByTestId("handoff-returned").click();
    await expect(screen.getByTestId("return-sheet")).toContainText("Return Max?");
    await expect(screen.getByTestId("return-early-warning")).toContainText("It's not pick-up time yet");
    await expect(screen.getByTestId("return-early-warning")).toContainText("Do you really want to return Max now?");
    await screen.getByTestId("return-cancel").click();
    await expect(screen.getByTestId("return-sheet")).toHaveCount(0);
    expect(db.completions).toEqual([{ p_booking: BOOKING, p_kind: "drop_off" }]);
    await screen.getByTestId("handoff-returned").click();
    // Early: Return is the red, white-lettered button; Cancel is the plain one.
    await expect(screen.getByTestId("return-confirm")).toHaveCSS("background-color", "rgb(180, 35, 24)");
    await expect(screen.getByTestId("return-confirm")).toHaveText("Return");
    await expect(screen.getByTestId("return-confirm").locator("div").first()).toHaveCSS("color", "rgb(255, 255, 255)");
    await screen.getByTestId("return-confirm").click();
    await expect(screen.getByTestId("toast")).toContainText("Max home safe. Robert gets a notice");
    await expect(screen.getByTestId("handoff-pick_up")).toContainText("✓ Returned");
    await expect(screen.getByTestId("stay-complete")).toBeVisible();
    // A finished stay scrolls as one page: nothing stays pinned at the bottom (#382).
    await expect(screen.getByTestId("handoff-check")).toHaveCount(0);
    await expect(screen.getByTestId("stay-done")).toContainText("Stay complete");
    await expect(screen.getByTestId("received-review")).toContainText("Robert hasn't left a review yet."); // FB-29
    // Returned also asks the backend to write the stay's Life Record (once).
    await expect.poll(() => lifeRecordAsked).toEqual([{ booking_id: BOOKING }]);

    // A finished stay moves to Past.
    await page.goBack();
    await screen.getByRole("tab").getByText("Bookings", { exact: true }).click();
    await screen.getByTestId("sitter-bookings-tabs-past").click();
    await expect(screen.getByTestId(`booking-card-${BOOKING}`)).toContainText("✓ Returned");
    await expect(screen.getByTestId(`booking-card-${BOOKING}`)).toContainText("Completed"); // not "Confirmed" (FB-26)
    await expect(screen.getByTestId(`booking-card-${BOOKING}`)).not.toContainText("Confirmed");
  });

  test("Returned on time asks once, with no early warning; open tasks and a missing note are listed (FB-9)", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    seed(db, -3 * HOUR);
    Object.assign(db.booking_handoffs[0], { completed_at: new Date(Date.now() - 2 * HOUR).toISOString() });
    Object.assign(db.booking_handoffs[1], { scheduled_at: new Date(Date.now() - HOUR).toISOString() });
    db.care_tasks.push({
      id: "task-1", pet_id: MAX, type: "feeding", title: "Dinner", dose: null, scheduled_time: "23:50:00",
      repeat_daily: true, notes: null, active: true, created_by: OWNER.id, created_at: "2026-10-01T00:00:00Z",
    });
    await page.route("**/api/ai/life-record", (route) => route.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
    await signIn(page, SITTER);
    await page.goto(`/sitter/bookings/${BOOKING}`);
    const screen = app(page);

    await screen.getByTestId("handoff-returned").click();
    await expect(screen.getByTestId("return-sheet")).toContainText("This can't be undone, and it writes the Life Record.");
    await expect(screen.getByTestId("return-early-warning")).toHaveCount(0);
    await expect(screen.getByTestId("return-confirm")).not.toHaveCSS("background-color", "rgb(180, 35, 24)"); // normal button
    await expect(screen.getByTestId("return-tasks-left")).toContainText("1 care task still open today");
    await expect(screen.getByTestId("return-note-missing")).toContainText("You haven't sent today's note for Max");
    await screen.getByTestId("return-send-note").click();
    await expect(page).toHaveURL(/\/sitter\/feed\?view=diary$/); // the Diary is inside Feed (#329)
    expect(db.completions).toEqual([]);
  });

  test("with the note sent and nothing open, the Returned sheet has only the confirmation", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    seed(db, -3 * HOUR);
    Object.assign(db.booking_handoffs[0], { completed_at: new Date(Date.now() - 2 * HOUR).toISOString() });
    Object.assign(db.booking_handoffs[1], { scheduled_at: new Date(Date.now() - HOUR).toISOString() });
    db.daily_reports.push({ id: "r1", pet_id: MAX, sitter_id: SITTER.id, report_date: new Date().toLocaleDateString("en-CA", { timeZone: "America/Toronto" }), body: "Great day", status: "sent", sent_at: new Date().toISOString() });
    await signIn(page, SITTER);
    await page.goto(`/sitter/bookings/${BOOKING}`);
    const screen = app(page);

    await screen.getByTestId("handoff-returned").click();
    await expect(screen.getByTestId("return-sheet")).toContainText("Max goes home with Robert");
    await expect(screen.getByTestId("return-confirm")).toBeVisible();
    await expect(screen.getByTestId("return-tasks-left")).toHaveCount(0);
    await expect(screen.getByTestId("return-note-missing")).toHaveCount(0);
  });

  test("Returned from 30 minutes before the pick-up is the normal case: no warning, the usual button", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    seed(db, -3 * HOUR);
    Object.assign(db.booking_handoffs[0], { completed_at: new Date(Date.now() - 2 * HOUR).toISOString() });
    Object.assign(db.booking_handoffs[1], { scheduled_at: new Date(Date.now() + 20 * 60_000).toISOString() });
    await signIn(page, SITTER);
    await page.goto(`/sitter/bookings/${BOOKING}`);
    const screen = app(page);

    await screen.getByTestId("handoff-returned").click();
    await expect(screen.getByTestId("return-sheet")).toContainText("This can't be undone");
    await expect(screen.getByTestId("return-early-warning")).toHaveCount(0);
    await expect(screen.getByTestId("return-confirm")).not.toHaveCSS("background-color", "rgb(180, 35, 24)");
  });

  test("Returned 45 minutes before the pick-up is still early: warning and the red button", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    seed(db, -3 * HOUR);
    Object.assign(db.booking_handoffs[0], { completed_at: new Date(Date.now() - 2 * HOUR).toISOString() });
    Object.assign(db.booking_handoffs[1], { scheduled_at: new Date(Date.now() + 45 * 60_000).toISOString() });
    await signIn(page, SITTER);
    await page.goto(`/sitter/bookings/${BOOKING}`);
    const screen = app(page);

    await screen.getByTestId("handoff-returned").click();
    await expect(screen.getByTestId("return-early-warning")).toContainText("Do you really want to return Max now?");
    await expect(screen.getByTestId("return-confirm")).toHaveCSS("background-color", "rgb(180, 35, 24)");
  });

  test("the sitter reads the owner's stars and comment on the finished booking (FB-29)", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    seed(db, -72 * HOUR);
    for (const h of db.booking_handoffs) h.completed_at = h.scheduled_at;
    db.booking_handoffs[1].completed_at = new Date(Date.now() - HOUR).toISOString();
    db.reviews.push({ id: "rv1", booking_id: BOOKING, owner_id: OWNER.id, sitter_id: SITTER.id, rating: 4, comment: "Max came home so happy!", created_at: new Date().toISOString() });
    await signIn(page, SITTER);
    await expect(page).toHaveURL(/\/sitter$/);
    await page.goto(`/sitter/bookings/${BOOKING}`);
    const review = app(page).getByTestId("received-review");
    await expect(review).toContainText("Robert's review");
    await expect(review).toContainText("Max came home so happy!");
  });

  test("the sitter rates the owner privately after the stay; nobody else sees it and the owner is not told (FB-25)", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    seed(db, -72 * HOUR);
    for (const h of db.booking_handoffs) h.completed_at = h.scheduled_at;
    db.booking_handoffs[1].completed_at = new Date(Date.now() - HOUR).toISOString();
    await signIn(page, SITTER);
    await expect(page).toHaveURL(/\/sitter$/);
    await page.goto(`/sitter/bookings/${BOOKING}`);
    const screen = app(page);
    const card = screen.getByTestId("owner-note");
    await expect(card).toContainText("Only you can see this. Robert is never told.");
    const notices = db.notifications.length;

    await expect(screen.getByTestId("owner-note-done")).toHaveCount(0);
    await screen.getByTestId("owner-note-start").click();
    await screen.getByTestId("owner-note-rating-5").click();
    await screen.getByTestId("owner-note-preset-Happy to host again").click();
    await screen.getByTestId("owner-note-comment").fill("Max is a sweetheart.");
    await screen.getByTestId("owner-note-save").click();
    await expect(card).toContainText("Your note about Robert");
    await expect(card).toContainText("Max is a sweetheart.");
    expect(db.sitter_owner_notes).toHaveLength(1);
    expect(db.sitter_owner_notes[0]).toMatchObject({ rating: 5, comment: "Happy to host again\nMax is a sweetheart.", owner_id: OWNER.id });
    expect(db.notifications).toHaveLength(notices); // the owner is not told

    // Edit it later (e.g. from Past).
    await screen.getByTestId("owner-note-edit").click();
    await screen.getByTestId("owner-note-rating-4").click();
    await screen.getByTestId("owner-note-save").click();
    await expect(screen.getByTestId("owner-note-stars")).toBeVisible();
    expect(db.sitter_owner_notes).toHaveLength(1);
    expect(db.sitter_owner_notes[0].rating).toBe(4);

    // Done takes the sitter Home (#382).
    await screen.getByTestId("owner-note-done").click();
    await expect(page).toHaveURL(/\/sitter$/);
  });

  test("when the same owner asks again, the sitter sees their earlier private notes (FB-29)", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    seed(db, 5 * HOUR);
    db.sitter_owner_notes.push({ id: "n1", booking_id: "old-stay", sitter_id: SITTER.id, owner_id: OWNER.id, rating: 2, comment: "Late for the handoff", created_at: "2026-09-01T12:00:00Z", updated_at: "2026-09-01T12:00:00Z" });
    await signIn(page, SITTER);
    await expect(page).toHaveURL(/\/sitter$/);
    await page.goto(`/sitter/bookings/${BOOKING}`);
    const past = app(page).getByTestId("past-owner-notes");
    await expect(past).toContainText("Your notes from earlier stays with Robert");
    await expect(past).toContainText("Late for the handoff");
    await expect(past).toContainText("Only you can see this");
  });

  test("Received waits until 2 hours before drop-off", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    seed(db, 5 * HOUR);
    await signIn(page, SITTER);
    await expect(page).toHaveURL(/\/sitter$/);
    await page.goto(`/sitter/bookings/${BOOKING}`);
    const screen = app(page);

    await expect(screen.getByTestId("handoff-check")).toContainText("You can check in from");
    await expect(screen.getByTestId("handoff-received")).toBeDisabled();
    expect(db.completions).toHaveLength(0);
  });

  test("the owner sees the check-in on their booking", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    seed(db, HOUR);
    db.booking_handoffs[0].completed_at = new Date(Date.now() - 60_000).toISOString();
    await signIn(page, OWNER);
    await expect(page).toHaveURL(/\/owner$/);
    await page.goto(`/owner/bookings/${BOOKING}`);
    await expect(app(page).getByTestId("handoff-drop_off")).toContainText("✓ Received");
  });
});
