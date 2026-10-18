import { expect, test } from "@playwright/test";

import { app, signIn } from "./helpers";
import { MockDb, OWNER, SITTER, mockSupabase } from "./supabaseMock";

// Sitter requests (phase-03b 3B.4): Requests · In progress · Upcoming · Past, detail, Accept / Suggest / Decline.

const BOOKING = "00000000-0000-4000-8000-0000000000e1";
const MAX = "00000000-0000-4000-8000-0000000000c1";
const MOCHI = "00000000-0000-4000-8000-0000000000c2";

/** Robert asks Chloe for Max + Mochi; the drop-off is outside Chloe's hours. */
function seed(db: MockDb, meetGreet: string) {
  db.pets.push(
    { id: MAX, owner_id: OWNER.id, species: "dog", name: "Max", breed: "Maltese", notes: "Pill in a treat" },
    { id: MOCHI, owner_id: OWNER.id, species: "cat", name: "Mochi", breed: null, notes: null },
  );
  db.pet_allergies.push({ id: "allergy-chicken", pet_id: MAX, allergen: "chicken" });
  db.care_tasks.push({
    id: "task-breakfast",
    pet_id: MAX,
    title: "Breakfast",
    type: "feeding",
    scheduled_time: "08:00:00",
    dose: null,
    active: true,
  });
  db.bookings.push({
    id: BOOKING,
    owner_id: OWNER.id,
    sitter_id: SITTER.id,
    status: "requested",
    service_type: "boarding",
    meet_greet_status: meetGreet,
    created_at: "2026-10-02T18:00:00Z",
  });
  db.booking_pets.push({ booking_id: BOOKING, pet_id: MAX }, { booking_id: BOOKING, pet_id: MOCHI });
  db.booking_handoffs.push(
    {
      id: "h-drop",
      booking_id: BOOKING,
      kind: "drop_off",
      scheduled_at: "2030-10-05T11:00:00.000Z", // 7:00 AM Toronto
      location_type: "sitter_home",
      location_note: null,
      within_sitter_hours: false,
      status: "proposed",
      proposed_by: OWNER.id,
      completed_at: null,
      created_at: "2026-10-02T18:00:00Z",
    },
    {
      id: "h-pick",
      booking_id: BOOKING,
      kind: "pick_up",
      scheduled_at: "2030-10-08T21:00:00.000Z", // 5:00 PM Toronto
      location_type: "owner_home",
      location_note: null,
      within_sitter_hours: true,
      status: "proposed",
      proposed_by: OWNER.id,
      completed_at: null,
      created_at: "2026-10-02T18:00:00Z",
    },
  );
}

async function openRequest(page: import("@playwright/test").Page) {
  await signIn(page, SITTER);
  await expect(page).toHaveURL(/\/sitter$/);
  const screen = app(page);
  await screen.getByRole("tab").getByText("Bookings", { exact: true }).click();
  const card = screen.getByTestId(`booking-card-${BOOKING}`);
  await expect(card).toBeVisible();
  return { screen, card };
}

test.describe("sitter requests", () => {
  test("a request for a pet with an earlier stay shows the previous sitter's Life Record, folded", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    seed(db, "not_needed");
    db.pet_life_records.push({
      id: "rec1", pet_id: MAX, booking_id: "old-booking", sitter_id: OWNER.id, // an earlier sitter (any other profile)
      summary: { eats: "Finishes breakfast.", meds: "Takes the pill in a treat.", potty: null, behavior: null, heads_up: ["Chicken allergy"], sitter_tips: [], changed_since_last: [] },
      stay_from: "2026-09-01", stay_to: "2026-09-03", created_at: "2026-09-04T00:00:00Z",
    });
    const { screen, card } = await openRequest(page);
    await card.click();
    await expect(screen.getByTestId(`record-fold-${MAX}`)).toContainText("From Max's Life Record");
    await expect(screen.getByTestId(`record-fold-card-${MAX}`)).toHaveCount(0); // folded
    await screen.getByTestId(`record-fold-toggle-${MAX}`).click();
    await expect(screen.getByTestId(`record-fold-card-${MAX}`)).toContainText("Takes the pill in a treat.");
    await expect(screen.getByTestId(`record-fold-card-${MAX}`)).toContainText("Chicken allergy");
    await expect(screen.getByTestId(`record-fold-${MOCHI}`)).toHaveCount(0); // no record for Mochi: nothing shown
  });

  test("the sitter sees the owner's cover photo on the request, or their initial when there is none (#137)", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    seed(db, "not_needed");
    const { screen, card } = await openRequest(page);
    await card.click();
    await expect(screen.getByTestId("booking-owner")).toHaveText("Robert");
    await expect(screen.getByTestId("booking-owner-avatar-initial")).toBeVisible();
    await expect(screen.getByTestId("booking-owner-avatar-photo")).toHaveCount(0);

    db.profile_photos.push({ id: "p1", profile_id: OWNER.id, public_id: `goldito/profile/${OWNER.id}/a` });
    await page.reload();
    await expect(screen.getByTestId("booking-owner-avatar-photo")).toBeVisible();
    await expect(screen.getByTestId("booking-owner-avatar-initial")).toHaveCount(0);
  });

  test("a first-time request shows custom time and Meet first; the sitter's button is Yes, let's meet", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    seed(db, "required");
    const { screen, card } = await openRequest(page);

    await expect(screen.getByTestId("sitter-bookings-tabs-requests-count")).toHaveText("1");
    await expect(card).toContainText("Robert");
    await expect(card).toContainText("Custom time — needs your OK");
    await expect(card).toContainText("Meet first");
    await expect(card).toContainText("Drop-off Oct 5, 7:00 AM · Your place");
    await expect(card).toContainText("Pick-up Oct 8, 5:00 PM · Robert's place");

    await card.click();
    await expect(page).toHaveURL(new RegExp(`/sitter/bookings/${BOOKING}$`));
    await expect(screen.getByTestId("meet-greet")).toContainText("Say \"Yes, let's meet\" to hold these dates");
    await expect(screen.getByTestId("stage-caption")).toHaveText("Your turn");
    await expect(screen.getByTestId("handoff-drop_off")).toContainText("Custom time — outside your hours, needs your OK.");
    await expect(screen.getByTestId("pet-care-Max")).toContainText("chicken");
    await expect(screen.getByTestId("pet-care-Max")).toContainText("8:00 AM · Breakfast");
    await expect(screen.getByTestId("pet-care-Mochi")).toContainText("No allergies listed");
    await expect(screen.getByTestId("interest-booking")).toHaveText("Yes, let's meet");
    await expect(screen.getByTestId("accept-booking")).toHaveCount(0);
  });

  test("the tab opens on Requests, but on Upcoming once a stay is on or about to start", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    seed(db, "not_needed");
    await signIn(page, SITTER);
    await expect(page).toHaveURL(/\/sitter$/);
    await page.goto("/sitter/bookings");
    const screen = app(page);
    await expect(screen.getByTestId(`booking-card-${BOOKING}`)).toBeVisible();

    // A confirmed stay that starts within 48 h now comes first, with the request still counted on its tab.
    const soon = new Date(Date.now() + 6 * 3_600_000).toISOString();
    db.bookings.push({ id: "soon1", owner_id: OWNER.id, sitter_id: SITTER.id, status: "confirmed", service_type: "boarding", meet_greet_status: "not_needed", created_at: "2026-10-02T18:00:00Z" });
    db.booking_pets.push({ booking_id: "soon1", pet_id: MOCHI });
    db.booking_handoffs.push(
      { id: "s-drop", booking_id: "soon1", kind: "drop_off", scheduled_at: soon, location_type: "sitter_home", location_note: null, within_sitter_hours: true, status: "agreed", proposed_by: OWNER.id, completed_at: null, created_at: "2026-10-02T18:00:00Z" },
      { id: "s-pick", booking_id: "soon1", kind: "pick_up", scheduled_at: "2030-10-08T21:00:00.000Z", location_type: "sitter_home", location_note: null, within_sitter_hours: true, status: "agreed", proposed_by: OWNER.id, completed_at: null, created_at: "2026-10-02T18:00:00Z" },
    );
    await page.goto("/sitter/bookings");
    await expect(screen.getByTestId("booking-card-soon1")).toBeVisible();
    await expect(screen.getByTestId("sitter-bookings-tabs-requests-count")).toHaveText("1");
    await expect(screen.getByTestId(`booking-card-${BOOKING}`)).toHaveCount(0);
  });

  test("a stay with the pets already received sits under In progress, not Upcoming, and the tab opens on it (FB-8)", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    seed(db, "not_needed");
    const hour = 3_600_000;
    const iso = (offset: number) => new Date(Date.now() + offset).toISOString();
    const handoff = (id: string, booking: string, kind: string, at: string, completedAt: string | null) => ({
      id, booking_id: booking, kind, scheduled_at: at, location_type: "sitter_home", location_note: null,
      within_sitter_hours: true, status: "agreed", proposed_by: OWNER.id, completed_at: completedAt, created_at: "2026-10-02T18:00:00Z",
    });
    // Mochi is with Chloe now; Max's stay starts in 10 days; a very old stay was never marked Returned.
    for (const [id, pet] of [["now1", MOCHI], ["later1", MAX], ["old1", MAX]] as const) {
      db.bookings.push({ id, owner_id: OWNER.id, sitter_id: SITTER.id, status: "confirmed", service_type: "boarding", meet_greet_status: "not_needed", created_at: "2026-10-02T18:00:00Z" });
      db.booking_pets.push({ booking_id: id, pet_id: pet });
    }
    db.booking_handoffs.push(
      handoff("n-drop", "now1", "drop_off", iso(-20 * hour), iso(-19 * hour)),
      handoff("n-pick", "now1", "pick_up", iso(30 * hour), null),
      handoff("l-drop", "later1", "drop_off", iso(240 * hour), null),
      handoff("l-pick", "later1", "pick_up", iso(300 * hour), null),
      handoff("o-drop", "old1", "drop_off", iso(-400 * hour), null),
      handoff("o-pick", "old1", "pick_up", iso(-350 * hour), null),
    );
    await signIn(page, SITTER);
    await expect(page).toHaveURL(/\/sitter$/);
    await page.goto("/sitter/bookings");
    const screen = app(page);

    await expect(screen.getByTestId("booking-card-now1")).toBeVisible(); // lands on In progress
    await expect(screen.getByTestId("sitter-bookings-tabs-in_progress-count")).toHaveText("1");
    await expect(screen.getByTestId("booking-card-later1")).toHaveCount(0);

    await screen.getByTestId("sitter-bookings-tabs-upcoming").click();
    await expect(screen.getByTestId("booking-card-later1")).toBeVisible();
    await expect(screen.getByTestId("booking-card-now1")).toHaveCount(0);
  });

  test("an old stay nobody marked Returned does not pull the tab to Upcoming (L-2)", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    seed(db, "not_needed");
    const iso = (offset: number) => new Date(Date.now() + offset).toISOString();
    db.bookings.push({ id: "old1", owner_id: OWNER.id, sitter_id: SITTER.id, status: "confirmed", service_type: "boarding", meet_greet_status: "not_needed", created_at: "2026-10-02T18:00:00Z" });
    db.booking_pets.push({ booking_id: "old1", pet_id: MAX });
    for (const [id, kind, at] of [["o-drop", "drop_off", iso(-400 * 3_600_000)], ["o-pick", "pick_up", iso(-350 * 3_600_000)]]) {
      db.booking_handoffs.push({
        id, booking_id: "old1", kind, scheduled_at: at, location_type: "sitter_home", location_note: null,
        within_sitter_hours: true, status: "agreed", proposed_by: OWNER.id, completed_at: null, created_at: "2026-10-02T18:00:00Z",
      });
    }
    await signIn(page, SITTER);
    await expect(page).toHaveURL(/\/sitter$/);
    await page.goto("/sitter/bookings");
    const screen = app(page);
    await expect(screen.getByTestId(`booking-card-${BOOKING}`)).toBeVisible(); // the open request, on Requests
    await expect(screen.getByTestId("booking-card-old1")).toHaveCount(0);
  });

  test("Accept confirms a pair that has met and moves it to Upcoming", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    seed(db, "not_needed");
    const { screen, card } = await openRequest(page);
    await card.click();

    await screen.getByTestId("accept-booking").click();
    await expect(screen.getByTestId("toast")).toContainText("Booking confirmed — Robert gets a notice");
    expect(db.responses).toEqual([{ p_booking: BOOKING, p_accept: true, p_note: null }]);
    expect(db.bookings[0].status).toBe("confirmed");
    await expect(screen.getByTestId("accept-booking")).toHaveCount(0);

    await page.goBack();
    await screen.getByTestId("sitter-bookings-tabs-upcoming").click();
    await expect(screen.getByTestId(`booking-card-${BOOKING}`)).toContainText("Confirmed");
  });

  test("Suggest another time sends a counter-offer and then waits for the owner", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    seed(db, "not_needed");
    const { screen, card } = await openRequest(page);
    await card.click();

    await screen.getByTestId("suggest-drop_off").click();
    await expect(screen.getByTestId("change-time-value")).toHaveText("7:00 AM");
    for (let i = 0; i < 6; i++) await screen.getByTestId("change-time-plus").click();
    await expect(screen.getByTestId("change-time-value")).toHaveText("8:30 AM");
    await screen.getByTestId("change-send").click();

    await expect(screen.getByTestId("toast")).toContainText("New time sent to Robert");
    expect(db.proposals).toEqual([{ p_booking: BOOKING, p_kind: "drop_off", p_at: "2030-10-05T12:30:00.000Z" }]);
    await expect(screen.getByTestId("handoff-drop_off")).toContainText("8:30 AM");
    await expect(screen.getByTestId("handoff-drop_off")).toContainText("You suggested this — waiting for Robert.");
    await expect(screen.getByTestId("accept-booking")).toBeDisabled();
  });

  test("a request whose pick-up time passed is Expired: it sits in Past and can't be accepted", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    seed(db, "not_needed");
    for (const h of db.booking_handoffs) h.scheduled_at = h.kind === "drop_off" ? "2020-10-05T11:00:00.000Z" : "2020-10-08T21:00:00.000Z";
    await signIn(page, SITTER);
    const screen = app(page);
    await screen.getByRole("tab").getByText("Bookings", { exact: true }).click();
    await expect(screen.getByText("No requests yet")).toBeVisible();
    await screen.getByTestId("sitter-bookings-tabs-past").click();
    const card = screen.getByTestId(`booking-card-${BOOKING}`);
    await expect(card).toContainText("Expired — the times have passed");
    await card.click();
    await expect(screen.getByTestId("accept-booking")).toBeDisabled();
  });

  test("Decline asks first, ends the request and lands it in Past", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    seed(db, "required");
    const { screen, card } = await openRequest(page);
    await card.click();

    await screen.getByTestId("decline-booking").click();
    await expect(screen.getByTestId("decline-sheet")).toContainText("Robert gets a notice and can find another sitter.");
    await screen.getByTestId("decline-confirm").click();
    await expect(screen.getByTestId("toast")).toContainText("Request declined");
    expect(db.bookings[0].status).toBe("declined");
    expect(db.responses.at(-1)).toMatchObject({ p_accept: false, p_note: null }); // reason and note are optional

    await expect(page).toHaveURL(/\/sitter\/bookings$/);
    await expect(screen.getByText("No requests yet")).toBeVisible();
    await screen.getByTestId("sitter-bookings-tabs-past").click();
    await expect(screen.getByTestId(`booking-card-${BOOKING}`)).toContainText("Declined");
  });

  test("Decline can carry reason chips and a short note, which the owner is told", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    seed(db, "required");
    const { screen, card } = await openRequest(page);
    await card.click();

    await screen.getByTestId("decline-booking").click();
    await screen.getByTestId("decline-reason-0").click();
    await screen.getByTestId("decline-reason-3").click();
    await screen.getByTestId("decline-note").fill("Try the week after?");
    await screen.getByTestId("decline-confirm").click();
    await expect(screen.getByTestId("toast")).toContainText("Request declined");

    const note = "Fully booked those dates · Let's talk first\nTry the week after?";
    expect(db.responses.at(-1)).toMatchObject({ p_accept: false, p_note: note });
    expect(db.bookings[0]).toMatchObject({ status: "declined", sitter_note: note });
    expect(db.notifications.find((n) => n.type === "booking_declined")).toMatchObject({ user_id: OWNER.id, body: note });
  });

  test("the decline sheet's \"Suggest another time instead\" opens the time sheet without declining", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    seed(db, "required");
    const { screen, card } = await openRequest(page);
    await card.click();

    await screen.getByTestId("decline-booking").click();
    await screen.getByTestId("decline-suggest").click();
    await expect(screen.getByTestId("decline-sheet")).toHaveCount(0);
    await expect(screen.getByText("Suggest another time", { exact: true })).toBeVisible();
    expect(db.bookings[0].status).toBe("requested");
  });

  test("the owner sees why a request was declined", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    seed(db, "required");
    Object.assign(db.bookings[0], { status: "declined", sitter_note: "Fully booked those dates" });
    await signIn(page, OWNER);
    await page.goto(`/owner/bookings/${BOOKING}`);
    const screen = app(page);
    await expect(screen.getByTestId("booking-ended")).toContainText("Chloe can't take this one.");
    await expect(screen.getByTestId("declined-reason")).toHaveText("“Fully booked those dates”");
    // No empty card between the header card and the ended notice (#133).
    await expect(screen.getByTestId("stage-bar")).toHaveCount(0);
    await expect(screen.getByTestId("booking-ended").locator("xpath=preceding-sibling::*[1]")).not.toBeEmpty();
  });

  test("a cancelled booking shows the sitter no empty progress card either", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    seed(db, "required");
    Object.assign(db.bookings[0], { status: "cancelled", cancelled_by: OWNER.id, cancel_reason: "Plans changed" });
    await signIn(page, SITTER);
    await page.goto(`/sitter/bookings/${BOOKING}`);
    const screen = app(page);
    await expect(screen.getByTestId("booking-ended")).toBeVisible();
    await expect(screen.getByTestId("stage-bar")).toHaveCount(0);
    await expect(screen.getByTestId("booking-ended").locator("xpath=preceding-sibling::*[1]")).not.toBeEmpty();
  });
});
