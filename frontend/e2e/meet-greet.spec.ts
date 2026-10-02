import { Page, expect, test } from "@playwright/test";

import { app, signIn } from "./helpers";
import { MockDb, MockUser, OWNER, SITTER, mockSupabase } from "./supabaseMock";

// Meet & Greet for a first-time pair (phase-03b 3B.9, D44): in person, video, done, skip.

const BOOKING = "00000000-0000-4000-8000-0000000000e1";
const MAX = "00000000-0000-4000-8000-0000000000c1";

function seed(db: MockDb, meetGreet: Record<string, unknown>) {
  db.pets.push({ id: MAX, owner_id: OWNER.id, species: "dog", name: "Max", breed: null, notes: null });
  db.owner_profiles.push({ id: OWNER.id, meet_spots: ["Trinity Bellwoods — north gate"] });
  db.sitter_profiles.push({ id: SITTER.id, meet_spots: ["Christie Pits — east entrance"] });
  db.bookings.push({
    id: BOOKING,
    owner_id: OWNER.id,
    sitter_id: SITTER.id,
    status: "requested",
    service_type: "boarding",
    created_at: "2026-10-02T18:00:00Z",
    meet_greet_status: "required",
    ...meetGreet,
  });
  db.booking_pets.push({ booking_id: BOOKING, pet_id: MAX });
  for (const [kind, at] of [
    ["drop_off", "2030-10-05T13:30:00.000Z"],
    ["pick_up", "2030-10-08T21:00:00.000Z"],
  ]) {
    db.booking_handoffs.push({
      id: `h-${kind}`,
      booking_id: BOOKING,
      kind,
      scheduled_at: at,
      location_type: "sitter_home",
      location_note: null,
      within_sitter_hours: true,
      status: "proposed",
      proposed_by: OWNER.id,
      completed_at: null,
      created_at: "2026-10-02T18:00:00Z",
    });
  }
}

async function openDetail(page: Page, user: MockUser) {
  await signIn(page, user);
  await expect(page).toHaveURL(user.role === "owner" ? /\/owner$/ : /\/sitter$/);
  await page.goto(`/${user.role}/bookings/${BOOKING}`);
  const screen = app(page);
  await expect(screen.getByTestId("meet-greet")).toBeVisible();
  return screen;
}

test.describe("meet & greet", () => {
  test("the owner suggests meeting in person at the sitter's spot", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    seed(db, {});
    const screen = await openDetail(page, OWNER);
    await expect(screen.getByTestId("meet-greet")).toContainText("Lucy can accept once you've met");

    await screen.getByTestId("meet-schedule").click();
    await expect(screen.getByTestId("meet-time-value")).toHaveText("7:00 PM");
    await expect(screen.getByTestId("meet-spot-Trinity Bellwoods — north gate")).toContainText("Chloe's spot");
    await screen.getByTestId("meet-spot-Christie Pits — east entrance").click();
    await screen.getByTestId("meet-send").click();

    await expect(screen.getByTestId("toast")).toContainText("Meet & Greet sent to Lucy");
    const call = db.meetGreetCalls.find((c) => c.fn === "propose_meet_greet");
    expect(call).toMatchObject({ p_mode: "in_person", p_place: "Christie Pits — east entrance" });
    await expect(screen.getByTestId("meet-greet")).toContainText("Waiting for Lucy");
    await expect(screen.getByTestId("meet-greet")).toContainText("In person · Christie Pits — east entrance");
  });

  test("the sitter accepts, marks it done after meeting, and can then accept the booking", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    seed(db, {
      meet_greet_status: "proposed",
      meet_greet_mode: "in_person",
      meet_greet_place: "Christie Pits — east entrance",
      meet_greet_at: "2030-10-04T23:00:00.000Z",
      meet_greet_proposed_by: OWNER.id,
    });
    const screen = await openDetail(page, SITTER);
    await expect(screen.getByTestId("accept-booking")).toBeDisabled();
    await expect(screen.getByTestId("meet-greet")).toContainText("Chloe suggested a Meet & Greet");
    await expect(screen.getByTestId("meet-greet")).toContainText("Oct 4, 7:00 PM");

    await screen.getByTestId("meet-accept").click();
    await expect(screen.getByTestId("toast")).toContainText("Meet & Greet set with Chloe");
    await expect(screen.getByTestId("meet-greet")).toContainText("Meet & Greet set ✅");
    await expect(screen.getByTestId("meet-greet")).toContainText("After you meet, tap Done here.");
    await screen.getByTestId("meet-check-Care needs").click();
    await expect(screen.getByTestId("meet-check-Care needs")).toHaveAttribute("aria-checked", "true");

    // The meeting time passes.
    db.bookings[0].meet_greet_at = new Date(Date.now() - 3_600_000).toISOString();
    await page.reload();
    await screen.getByTestId("meet-done").click();
    await expect(screen.getByTestId("toast")).toContainText("Meet & Greet done");
    await expect(screen.getByTestId("meet-greet")).toContainText("Met ✓");
    await expect(screen.getByTestId("accept-booking")).toBeEnabled();
    await screen.getByTestId("accept-booking").click();
    expect(db.bookings[0].status).toBe("confirmed");
  });

  test("an agreed video Meet & Greet shows Join Google Meet once the link exists", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    seed(db, {
      meet_greet_status: "agreed",
      meet_greet_mode: "video",
      meet_greet_at: "2030-10-04T23:00:00.000Z",
      meet_greet_proposed_by: SITTER.id,
    });
    const screen = await openDetail(page, OWNER);
    await expect(screen.getByTestId("meet-greet")).toContainText("Video · Oct 4, 7:00 PM");
    await expect(screen.getByTestId("meet-greet")).toContainText("No Google Meet link yet");
    await expect(screen.getByTestId("meet-join")).toHaveCount(0);

    db.bookings[0].meet_greet_link = "https://meet.google.com/abc-defg-hij";
    await page.reload();
    await expect(screen.getByTestId("meet-join")).toBeVisible();
    await expect(screen.getByTestId("meet-calendar")).toBeVisible();
  });

  test("a skip needs the other side: Continue unlocks Accept", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    seed(db, {});
    const owner = await openDetail(page, OWNER);
    await owner.getByTestId("meet-skip").click();
    await expect(owner.getByTestId("meet-skip-sheet")).toContainText("If Lucy says no, this booking will be cancelled.");
    await owner.getByTestId("meet-skip-confirm").click();
    await expect(owner.getByTestId("toast")).toContainText("Asked Lucy to skip the Meet & Greet");
    expect(db.bookings[0].meet_greet_status).toBe("skip_requested");
    await expect(owner.getByTestId("meet-greet")).toContainText("Waiting for Lucy");

    // Switch phones: drop the owner's stored session, then sign in as the sitter.
    await page.evaluate(() => localStorage.clear());
    const sitter = await openDetail(page, SITTER);
    await expect(sitter.getByTestId("meet-greet")).toContainText("Chloe would like to skip the Meet & Greet");
    await sitter.getByTestId("meet-skip-accept").click();
    await expect(sitter.getByTestId("toast")).toContainText("Meet & Greet skipped");
    await expect(sitter.getByTestId("meet-greet")).toContainText("Meet & Greet skipped — you both agreed");
    await expect(sitter.getByTestId("accept-booking")).toBeEnabled();
  });

  test("declining a skip asks first and cancels the booking", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    seed(db, { meet_greet_status: "skip_requested", meet_greet_skip_requested_by: OWNER.id });
    const screen = await openDetail(page, SITTER);
    await screen.getByTestId("meet-skip-decline").click();
    await expect(screen.getByTestId("meet-decline-sheet")).toContainText("Chloe gets a notice and can find another sitter.");
    await screen.getByTestId("meet-decline-confirm").click();
    await expect(screen.getByTestId("toast")).toContainText("Booking cancelled");
    expect(db.bookings[0]).toMatchObject({ status: "cancelled", cancel_reason: "meet_greet_declined" });
  });
});
