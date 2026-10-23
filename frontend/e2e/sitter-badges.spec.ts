import { expect, test } from "@playwright/test";

import { app, signIn } from "./helpers";
import { OWNER, SITTER, mockSupabase, type MockDb } from "./supabaseMock";

// Sitter badges on Profile (11.12, #184): the first stay and the first 5-star review, worked out from the data;
// the rest of the shelf is locked shadows for badges that come later.

async function openProfile(page: import("@playwright/test").Page, seed: (db: MockDb) => void = () => undefined) {
  const { db } = await mockSupabase(page, [OWNER, SITTER]);
  seed(db);
  await signIn(page, SITTER);
  const screen = app(page);
  await screen.getByTestId("open-menu").click();
  await screen.getByTestId("open-profile").click();
  await expect(screen.getByTestId("sitter-badges")).toBeVisible();
  await screen.getByTestId("sitter-badges-toggle").click();
  return screen;
}

const booking = (id: string) => ({ id, owner_id: OWNER.id, sitter_id: SITTER.id, status: "confirmed", service_type: "boarding", created_at: "2026-10-01T09:00:00Z" });
const pickUp = (bookingId: string, completedAt: string | null) => ({
  id: `${bookingId}-pick_up`,
  booking_id: bookingId,
  kind: "pick_up",
  scheduled_at: "2026-10-06T21:00:00Z",
  status: "agreed",
  completed_at: completedAt,
});

test.describe("sitter badges", () => {
  test("a new sitter: both badges not yet, and locked shadows after them", async ({ page }) => {
    const screen = await openProfile(page);
    await expect(screen.getByTestId("badge-first_stay-when")).toHaveText("Not yet");
    await expect(screen.getByTestId("badge-first_five_star-when")).toHaveText("Not yet");
    await expect(screen.getByTestId("badge-locked")).toHaveCount(4);
  });

  test("the first finished stay and the first 5-star review earn their badges on the day they happened", async ({ page }) => {
    const screen = await openProfile(page, (db) => {
      db.bookings.push(booking("b-old"), booking("b-new"), booking("b-open"));
      // Two finished stays: the badge takes the earlier pick-up. A stay still running does not count.
      db.booking_handoffs.push(pickUp("b-new", "2026-10-12T21:00:00Z"), pickUp("b-old", "2026-10-06T21:00:00Z"), pickUp("b-open", null));
      db.reviews.push(
        { id: "r1", booking_id: "b-old", owner_id: OWNER.id, sitter_id: SITTER.id, rating: 4, comment: null, created_at: "2026-10-07T15:00:00Z" },
        { id: "r2", booking_id: "b-new", owner_id: OWNER.id, sitter_id: SITTER.id, rating: 5, comment: null, created_at: "2026-10-13T15:00:00Z" },
      );
    });
    await expect(screen.getByTestId("badge-first_stay-when")).toHaveText("Oct 6");
    await expect(screen.getByTestId("badge-first_stay")).toHaveAttribute("aria-label", "First stay, earned");
    await expect(screen.getByTestId("badge-first_five_star-when")).toHaveText("Oct 13");
    await expect(screen.getByTestId("badge-locked")).toHaveCount(4);
  });

  test("an owner's Profile has no badge shelf", async ({ page }) => {
    await mockSupabase(page, [OWNER]);
    await signIn(page, OWNER);
    const screen = app(page);
    await screen.getByTestId("open-menu").click();
    await screen.getByTestId("open-profile").click();
    await expect(screen.getByTestId("profile-display_name")).toBeVisible();
    await expect(screen.getByTestId("sitter-badges")).toHaveCount(0);
  });
});
