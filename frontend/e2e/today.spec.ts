import { expect, test } from "@playwright/test";

import { app, signIn } from "./helpers";
import { MockDb, MockUser, OWNER, SITTER, mockSupabase } from "./supabaseMock";

// Sitter Home dashboard (D47b / was Today 3B.8): Now caring · Today handoffs · Upcoming · Requests.

const JOY: MockUser = {
  id: "00000000-0000-4000-8000-000000000005",
  email: "joy@pawnote.test",
  password: "coco-and-toto",
  role: "owner",
  displayName: "Joy",
};
const HOUR = 3_600_000;

function booking(
  db: MockDb,
  id: string,
  owner: MockUser,
  pet: { id: string; name: string; species: string },
  status: string,
  dropAt: number,
  pickAt: number,
  received = false,
) {
  db.pets.push({ id: pet.id, owner_id: owner.id, species: pet.species, name: pet.name, breed: null, notes: null });
  db.bookings.push({
    id,
    owner_id: owner.id,
    sitter_id: SITTER.id,
    status,
    service_type: "boarding",
    meet_greet_status: "not_needed",
    created_at: "2026-10-02T18:00:00Z",
  });
  db.booking_pets.push({ booking_id: id, pet_id: pet.id });
  for (const [kind, at] of [
    ["drop_off", dropAt],
    ["pick_up", pickAt],
  ] as const) {
    db.booking_handoffs.push({
      id: `${id}-${kind}`,
      booking_id: id,
      kind,
      scheduled_at: new Date(at).toISOString(),
      location_type: "sitter_home",
      location_note: null,
      within_sitter_hours: true,
      status: status === "confirmed" ? "agreed" : "proposed",
      proposed_by: owner.id,
      completed_at: received && kind === "drop_off" ? new Date(dropAt).toISOString() : null,
      created_at: "2026-10-02T18:00:00Z",
    });
  }
}

test.describe("sitter today", () => {
  test("shows who is in care, what is due today, what is coming, and new requests", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, JOY, SITTER]);
    const now = Date.now();
    // Joy's Coco is already here; Chloe's Max arrives in a minute; Chloe's Mochi comes next week.
    booking(db, "b-caring", JOY, { id: "p-coco", name: "Coco", species: "dog" }, "confirmed", now - 24 * HOUR, now + 48 * HOUR, true);
    booking(db, "b-today", OWNER, { id: "p-max", name: "Max", species: "dog" }, "confirmed", now + 60_000, now + 72 * HOUR);
    booking(db, "b-next", OWNER, { id: "p-mochi", name: "Mochi", species: "cat" }, "confirmed", now + 7 * 24 * HOUR, now + 8 * 24 * HOUR);
    booking(db, "b-request", JOY, { id: "p-toto", name: "Toto", species: "dog" }, "requested", now + 9 * 24 * HOUR, now + 10 * 24 * HOUR);

    await signIn(page, SITTER);
    await expect(page).toHaveURL(/\/sitter$/);
    const screen = app(page);

    await expect(screen.getByTestId("today-requests")).toContainText("Requests (1)");
    await expect(screen.getByTestId("today-caring")).toContainText("Joy's pet");
    await expect(screen.getByTestId("today-caring")).toContainText("Coco");
    await expect(screen.getByTestId("today-due")).toContainText("Drop-off");
    await expect(screen.getByTestId("today-due")).toContainText("Max · Chloe");
    await expect(screen.getByTestId("today-due")).toContainText("Your place");
    await expect(screen.getByTestId("today-upcoming")).toContainText("Mochi");
    await expect(screen.getByTestId("today-upcoming")).not.toContainText("Toto");

    await screen.getByTestId("today-due").getByText("Max · Chloe", { exact: false }).click();
    await expect(page).toHaveURL(/\/sitter\/bookings\/b-today$/);
    await expect(screen.getByTestId("handoff-received")).toBeEnabled();
  });
});
