import { expect, test } from "@playwright/test";

import { app, signIn } from "./helpers";
import { MockDb, OWNER, SITTER, mockSupabase } from "./supabaseMock";

// Cancel + Find a new sitter (phase-03b 3B.7).

const BOOKING = "00000000-0000-4000-8000-0000000000e1";
const MAX = "00000000-0000-4000-8000-0000000000c1";
const MOCHI = "00000000-0000-4000-8000-0000000000c2";

function seed(db: MockDb, booking: Record<string, unknown>, received = false) {
  db.pets.push(
    { id: MAX, owner_id: OWNER.id, species: "dog", name: "Max", breed: null, notes: null, created_at: "2026-01-01T00:00:00Z" },
    { id: MOCHI, owner_id: OWNER.id, species: "cat", name: "Mochi", breed: null, notes: null, created_at: "2026-01-02T00:00:00Z" },
  );
  db.bookings.push({
    id: BOOKING,
    owner_id: OWNER.id,
    sitter_id: SITTER.id,
    status: "confirmed",
    service_type: "boarding",
    meet_greet_status: "done",
    created_at: "2026-10-02T18:00:00Z",
    ...booking,
  });
  db.booking_pets.push({ booking_id: BOOKING, pet_id: MAX }, { booking_id: BOOKING, pet_id: MOCHI });
  for (const [kind, at, type] of [
    ["drop_off", "2030-10-05T13:30:00.000Z", "sitter_home"],
    ["pick_up", "2030-10-08T21:00:00.000Z", "owner_home"],
  ]) {
    db.booking_handoffs.push({
      id: `h-${kind}`,
      booking_id: BOOKING,
      kind,
      scheduled_at: at,
      location_type: type,
      location_note: null,
      within_sitter_hours: true,
      status: "agreed",
      proposed_by: OWNER.id,
      completed_at: received && kind === "drop_off" ? "2030-10-05T13:35:00.000Z" : null,
      created_at: "2026-10-02T18:00:00Z",
    });
  }
}

test.describe("cancel and rebook", () => {
  test("the sitter cancels; the owner finds a new sitter with the same pets, times and places", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    seed(db, {});
    await signIn(page, SITTER);
    await expect(page).toHaveURL(/\/sitter$/);
    await page.goto(`/sitter/bookings/${BOOKING}`);
    const sitter = app(page);
    await sitter.getByTestId("cancel-booking").click();
    await expect(sitter.getByTestId("cancel-sheet")).toContainText("Robert gets a notice and can find a new sitter.");
    await sitter.getByTestId("cancel-confirm").click();
    await expect(sitter.getByTestId("toast")).toContainText("Booking cancelled");
    expect(db.bookings[0]).toMatchObject({ status: "cancelled", cancelled_by: SITTER.id });

    await page.evaluate(() => localStorage.clear());
    await signIn(page, OWNER);
    await expect(page).toHaveURL(/\/owner$/);
    await page.goto(`/owner/bookings/${BOOKING}`);
    const owner = app(page);
    await expect(owner.getByTestId("booking-ended")).toContainText("Chloe cancelled this booking.");
    await expect(owner.getByTestId("cancel-booking")).toHaveCount(0);
    await owner.getByTestId("find-new-sitter").click();

    await expect(page).toHaveURL(new RegExp(`/owner/bookings/new\\?rebook=${BOOKING}$`));
    await expect(owner.getByTestId("rebook-note")).toBeVisible();
    await expect(owner.getByTestId("pick-pet-Max")).toHaveAttribute("aria-checked", "true");
    await expect(owner.getByTestId("pick-pet-Mochi")).toHaveAttribute("aria-checked", "true");
    await expect(owner.getByTestId("drop_off-day-value")).toHaveText("Oct 5");
    await expect(owner.getByTestId("drop_off-time-value")).toHaveText("9:30 AM");
    await expect(owner.getByTestId("pick_up-time-value")).toHaveText("5:00 PM");
    await expect(owner.getByTestId("pick_up-place-owner_home")).toHaveAttribute("aria-checked", "true");
  });

  test("the owner cancels before the drop-off, and cannot once the pets are with the sitter", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    seed(db, {});
    await signIn(page, OWNER);
    await expect(page).toHaveURL(/\/owner$/);
    await page.goto(`/owner/bookings/${BOOKING}`);
    const screen = app(page);
    await screen.getByTestId("cancel-booking").click();
    await expect(screen.getByTestId("cancel-sheet")).toContainText("Chloe gets a notice.");
    await screen.getByTestId("cancel-confirm").click();
    await expect(screen.getByTestId("toast")).toContainText("Booking cancelled");
    expect(db.cancellations).toEqual([{ p_booking: BOOKING, p_reason: "Owner cancelled" }]);
    await expect(screen.getByTestId("booking-ended")).toContainText("You cancelled this booking.");
  });

  test("after Received there is no Cancel, only Change time or place", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    seed(db, {}, true);
    await signIn(page, OWNER);
    await expect(page).toHaveURL(/\/owner$/);
    await page.goto(`/owner/bookings/${BOOKING}`);
    const screen = app(page);
    await expect(screen.getByTestId("handoff-drop_off")).toContainText("✓ Received");
    await expect(screen.getByTestId("cancel-booking")).toHaveCount(0);
    await expect(screen.getByTestId("change-booking")).toBeVisible();
  });
});
