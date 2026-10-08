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
    await signIn(page, SITTER);
    await expect(page).toHaveURL(/\/sitter$/);
    await page.goto(`/sitter/bookings/${BOOKING}`);
    const screen = app(page);

    await expect(screen.getByTestId("handoff-returned")).toHaveCount(0);
    await screen.getByTestId("handoff-received").click();
    await expect(screen.getByTestId("toast")).toContainText("Max checked in — Robert gets a notice");
    expect(db.completions).toEqual([{ p_booking: BOOKING, p_kind: "drop_off" }]);
    await expect(screen.getByTestId("handoff-drop_off")).toContainText("✓ Received");

    await screen.getByTestId("handoff-returned").click();
    await expect(screen.getByTestId("toast")).toContainText("Max on the way home — Robert gets a notice");
    await expect(screen.getByTestId("handoff-pick_up")).toContainText("✓ Returned");
    await expect(screen.getByTestId("stay-complete")).toBeVisible();

    // A finished stay moves to Past.
    await page.goBack();
    await screen.getByRole("tab").getByText("Bookings", { exact: true }).click();
    await screen.getByTestId("sitter-bookings-tabs-past").click();
    await expect(screen.getByTestId(`booking-card-${BOOKING}`)).toContainText("✓ Returned");
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
