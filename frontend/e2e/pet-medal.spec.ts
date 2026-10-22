import { expect, test } from "@playwright/test";

import { NOON_TORONTO, app, signIn } from "./helpers";
import { MockDb, OWNER, SITTER, mockSupabase } from "./supabaseMock";

// Pet medals (11.12, #184): the sitter gives one after Returned; the owner sees it under the pet room.

const BOOKING = "00000000-0000-4000-8000-0000000000e1";
const MAX = "00000000-0000-4000-8000-0000000000c1";
const MOCHI = "00000000-0000-4000-8000-0000000000c2";
const HOUR = 3_600_000;
const DROP = new Date(NOON_TORONTO.getTime() - 72 * HOUR).toISOString();
const PICK = new Date(NOON_TORONTO.getTime() - HOUR).toISOString();

/** A finished stay of Max and Mochi: Received three days ago, Returned an hour ago. */
function seedFinished(db: MockDb) {
  for (const [id, name, species] of [[MAX, "Max", "dog"], [MOCHI, "Mochi", "cat"]] as const) {
    db.pets.push({ id, owner_id: OWNER.id, species, name, breed: null, notes: null, created_at: "2026-10-01T09:00:00Z" });
    db.booking_pets.push({ booking_id: BOOKING, pet_id: id });
  }
  db.bookings.push({
    id: BOOKING,
    owner_id: OWNER.id,
    sitter_id: SITTER.id,
    status: "confirmed",
    service_type: "boarding",
    meet_greet_status: "done",
    created_at: "2026-10-02T18:00:00Z",
  });
  for (const [kind, scheduled, done] of [["drop_off", DROP, DROP], ["pick_up", PICK, PICK]] as const) {
    db.booking_handoffs.push({
      id: `h-${kind}`,
      booking_id: BOOKING,
      kind,
      scheduled_at: scheduled,
      location_type: "sitter_home",
      location_note: null,
      within_sitter_hours: true,
      status: "agreed",
      proposed_by: OWNER.id,
      completed_at: done,
      created_at: "2026-10-02T18:00:00Z",
    });
  }
}

async function start(page: import("@playwright/test").Page) {
  await page.clock.install({ time: NOON_TORONTO });
  await page.clock.resume();
  const { db } = await mockSupabase(page, [OWNER, SITTER], { now: NOON_TORONTO });
  seedFinished(db);
  return db;
}

test.describe("pet medals", () => {
  test("the sitter gives each pet of a finished stay a medal, once", async ({ page }) => {
    const db = await start(page);
    await signIn(page, SITTER);
    await page.goto(`/sitter/bookings/${BOOKING}`);
    const screen = app(page);

    await expect(screen.getByTestId("stay-complete")).toBeVisible();
    await screen.getByTestId(`medal-give-${MAX}`).click();
    await expect(screen.getByTestId("toast")).toContainText("🏅 Max got a medal. Robert can see it");
    await expect(screen.getByTestId(`medal-given-${MAX}`)).toBeVisible();
    await expect(screen.getByTestId(`medal-give-${MAX}`)).toHaveCount(0);
    // Mochi still waits for hers.
    await expect(screen.getByTestId(`medal-give-${MOCHI}`)).toBeVisible();
    expect(db.pet_medals).toHaveLength(1);
    expect(db.pet_medals[0]).toMatchObject({ pet_id: MAX, booking_id: BOOKING, sitter_id: SITTER.id });

    // Back on the page later, the given medal is remembered.
    await page.reload();
    await expect(screen.getByTestId(`medal-given-${MAX}`)).toBeVisible();
    await screen.getByTestId(`medal-give-${MOCHI}`).click();
    await expect(screen.getByTestId(`medal-given-${MOCHI}`)).toBeVisible();
    expect(db.pet_medals).toHaveLength(2);
  });

  test("a stay that is not over has no medal button", async ({ page }) => {
    const db = await start(page);
    db.booking_handoffs.find((h) => h.kind === "pick_up")!.completed_at = null;
    await signIn(page, SITTER);
    await page.goto(`/sitter/bookings/${BOOKING}`);
    await app(page).getByTestId("handoff-check").waitFor();
    await expect(app(page).getByTestId("medal-buttons")).toHaveCount(0);
  });

  test("the owner sees the medal under the pet room, only for that pet", async ({ page }) => {
    const db = await start(page);
    db.pet_medals.push({
      id: "medal-1",
      pet_id: MAX,
      booking_id: BOOKING,
      sitter_id: SITTER.id,
      stay_from: DROP,
      stay_to: PICK,
      awarded_at: PICK,
    });
    await signIn(page, OWNER);
    const screen = app(page);
    await screen.getByTestId("home-pager").waitFor();
    await screen.getByTestId("home-pager-flip").click();
    await expect(screen.getByTestId("pet-room-Max")).toBeVisible();
    await expect(screen.getByTestId("medal-medal-1")).toContainText("Chloe");
    await expect(screen.getByTestId("medal-medal-1")).toContainText("Oct 6 to Oct 9");
    await screen.getByTestId("pet-switch-Mochi").click();
    await expect(screen.getByTestId("pet-room-Mochi")).toBeVisible();
    await expect(screen.getByTestId("pet-medals")).toHaveCount(0);
  });
});
