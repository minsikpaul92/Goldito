import { expect, test } from "@playwright/test";

import { app, signIn } from "./helpers";
import { MockDb, OWNER, SITTER, mockSupabase } from "./supabaseMock";

// Sitter requests (phase-03b 3B.4): Requests · Upcoming · Past, detail, Accept / Suggest / Decline.

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
  test("a first-time request shows custom time and Meet first, and Accept waits", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    seed(db, "required");
    const { screen, card } = await openRequest(page);

    await expect(screen.getByTestId("sitter-bookings-tabs-requests")).toContainText("Requests (1)");
    await expect(card).toContainText("Robert");
    await expect(card).toContainText("Custom time — needs your OK");
    await expect(card).toContainText("Meet first");
    await expect(card).toContainText("Drop-off Oct 5, 7:00 AM · Your place");
    await expect(card).toContainText("Pick-up Oct 8, 5:00 PM · Robert's place");

    await card.click();
    await expect(page).toHaveURL(new RegExp(`/sitter/bookings/${BOOKING}$`));
    await expect(screen.getByTestId("meet-greet")).toContainText("Meet Robert first — or agree to skip the Meet & Greet.");
    await expect(screen.getByTestId("handoff-drop_off")).toContainText("Custom time — outside your hours, needs your OK.");
    await expect(screen.getByTestId("pet-care-Max")).toContainText("chicken");
    await expect(screen.getByTestId("pet-care-Max")).toContainText("8:00 AM · Breakfast");
    await expect(screen.getByTestId("pet-care-Mochi")).toContainText("No allergies listed");
    await expect(screen.getByTestId("accept-booking")).toBeDisabled();
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
    await expect(screen.getByTestId("sitter-bookings-tabs-requests")).toContainText("Requests (1)");
    await expect(screen.getByTestId(`booking-card-${BOOKING}`)).toHaveCount(0);
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

    await expect(page).toHaveURL(/\/sitter\/bookings$/);
    await expect(screen.getByText("No requests yet")).toBeVisible();
    await screen.getByTestId("sitter-bookings-tabs-past").click();
    await expect(screen.getByTestId(`booking-card-${BOOKING}`)).toContainText("Declined");
  });
});
