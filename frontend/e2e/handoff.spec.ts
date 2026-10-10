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
    await expect(screen.getByTestId("toast")).toContainText("Max checked in — Robert gets a notice");
    expect(db.completions).toEqual([{ p_booking: BOOKING, p_kind: "drop_off" }]);
    await expect(screen.getByTestId("handoff-drop_off")).toContainText("✓ Received");
    await expect(screen.getByText("In care", { exact: true })).toBeVisible(); // FB-26

    await screen.getByTestId("handoff-returned").click();
    await expect(screen.getByTestId("toast")).toContainText("Max home safe — Robert gets a notice");
    await expect(screen.getByTestId("handoff-pick_up")).toContainText("✓ Returned");
    await expect(screen.getByTestId("stay-complete")).toBeVisible();
    await expect(screen.getByTestId("received-review")).toContainText("Robert hasn't left a review yet."); // FB-29
    // Returned also asks the backend to write the stay's Life Record (once).
    await expect.poll(() => lifeRecordAsked).toEqual([{ booking_id: BOOKING }]);

    // A finished stay moves to Past.
    await page.goBack();
    await screen.getByRole("tab").getByText("Bookings", { exact: true }).click();
    await screen.getByTestId("sitter-bookings-tabs-past").click();
    await expect(screen.getByTestId(`booking-card-${BOOKING}`)).toContainText("✓ Returned");
    await expect(screen.getByTestId(`booking-card-${BOOKING}`)).toContainText("Completed — pets home"); // not "Confirmed" (FB-26)
    await expect(screen.getByTestId(`booking-card-${BOOKING}`)).not.toContainText("Confirmed");
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
    await expect(card).toContainText("Only you can see this — Robert is never told.");
    const notices = db.notifications.length;

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
