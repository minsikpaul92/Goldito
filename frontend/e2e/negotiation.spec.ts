import { Page, expect, test } from "@playwright/test";

import { app, signIn } from "./helpers";
import { MockDb, MockUser, OWNER, SITTER, mockSupabase } from "./supabaseMock";

// Negotiation + changes after confirm (phase-03b 3B.5): owner detail, ProposalCard both sides.

const BOOKING = "00000000-0000-4000-8000-0000000000e1";
const MAX = "00000000-0000-4000-8000-0000000000c1";

// Oct 5 7:00 / 8:30 AM and Oct 8 5:00 PM in Toronto (EDT, UTC−4).
const AT = {
  drop700: "2030-10-05T11:00:00.000Z",
  drop830: "2030-10-05T12:30:00.000Z",
  pick1700: "2030-10-08T21:00:00.000Z",
};

type Step = { kind: string; at: string; by: MockUser; status: string; minute: number; type?: string };

function seed(db: MockDb, status: string, steps: Step[]) {
  db.pets.push({ id: MAX, owner_id: OWNER.id, species: "dog", name: "Max", breed: "Maltese", notes: null });
  db.sitter_profiles.push({ id: SITTER.id, home_address: "100 Example St" });
  db.bookings.push({
    id: BOOKING,
    owner_id: OWNER.id,
    sitter_id: SITTER.id,
    status,
    service_type: "boarding",
    meet_greet_status: "not_needed",
    created_at: "2026-10-02T18:00:00Z",
  });
  db.booking_pets.push({ booking_id: BOOKING, pet_id: MAX });
  steps.forEach((s, i) =>
    db.booking_handoffs.push({
      id: `h-${i}`,
      booking_id: BOOKING,
      kind: s.kind,
      scheduled_at: s.at,
      location_type: s.type ?? "sitter_home",
      location_note: null,
      within_sitter_hours: true,
      status: s.status,
      proposed_by: s.by.id,
      completed_at: null,
      created_at: `2026-10-02T18:${String(s.minute).padStart(2, "0")}:00Z`,
    }),
  );
}

async function openDetail(page: Page, user: MockUser) {
  await signIn(page, user);
  await expect(page).toHaveURL(user.role === "owner" ? /\/owner$/ : /\/sitter$/);
  await page.goto(`/${user.role}/bookings/${BOOKING}`);
  const screen = app(page);
  await expect(screen.getByTestId("handoff-drop_off")).toBeVisible();
  return screen;
}

/** Lucy answered Chloe's 7:00 AM drop-off with 8:30 AM; the pick-up still waits for Lucy. */
const SITTER_COUNTER: Step[] = [
  { kind: "drop_off", at: AT.drop700, by: OWNER, status: "superseded", minute: 0 },
  { kind: "pick_up", at: AT.pick1700, by: OWNER, status: "proposed", minute: 1 },
  { kind: "drop_off", at: AT.drop830, by: SITTER, status: "proposed", minute: 5 },
];

const CONFIRMED: Step[] = [
  { kind: "drop_off", at: AT.drop830, by: OWNER, status: "agreed", minute: 0 },
  { kind: "pick_up", at: AT.pick1700, by: OWNER, status: "agreed", minute: 1 },
];

test.describe("negotiation", () => {
  test("the owner accepts the sitter's new drop-off time, with the offer history shown", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    seed(db, "requested", SITTER_COUNTER);
    await signIn(page, OWNER);
    await expect(page).toHaveURL(/\/owner$/);
    const screen = app(page);
    await screen.getByRole("tab").getByText("Bookings", { exact: true }).click();
    const card = screen.getByTestId(`booking-card-${BOOKING}`);
    await expect(card).toContainText("Time suggested by Lucy");
    await card.click();
    await expect(page).toHaveURL(new RegExp(`/owner/bookings/${BOOKING}$`));

    const proposal = screen.getByTestId("proposal-drop_off");
    await expect(proposal).toContainText("Lucy suggested a new drop-off");
    await expect(proposal).toContainText("Oct 5, 8:30 AM · Lucy's place");
    await expect(proposal).toContainText("You: Oct 5, 7:00 AM → Lucy: Oct 5, 8:30 AM");
    await screen.getByTestId("proposal-drop_off-accept").click();

    await expect(screen.getByTestId("toast")).toContainText("New time agreed with Lucy");
    expect(db.responses).toEqual([{ p_handoff: "h-2", p_accept: true }]);
    await expect(screen.getByTestId("proposal-drop_off")).toHaveCount(0);
    await expect(screen.getByTestId("handoff-drop_off")).toContainText("Oct 5, 8:30 AM");
    await expect(screen.getByText("Waiting for Lucy to answer your request.")).toBeVisible();
  });

  test("declining the sitter's time before confirm asks first and ends the request", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    seed(db, "requested", SITTER_COUNTER);
    const screen = await openDetail(page, OWNER);

    await screen.getByTestId("proposal-drop_off-decline").click();
    await expect(screen.getByTestId("end-request-sheet")).toContainText("This will end the booking request.");
    await screen.getByTestId("end-request-confirm").click();
    await expect(screen.getByTestId("toast")).toContainText("Request ended");
    expect(db.bookings[0].status).toBe("cancelled");
  });

  test("the owner counters with another time and then waits", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    seed(db, "requested", SITTER_COUNTER);
    const screen = await openDetail(page, OWNER);

    await screen.getByTestId("proposal-drop_off-suggest").click();
    await expect(screen.getByTestId("change-time-value")).toHaveText("8:30 AM");
    await screen.getByTestId("change-time-minus").click();
    await screen.getByTestId("change-time-minus").click();
    await screen.getByTestId("change-send").click();

    await expect(screen.getByTestId("toast")).toContainText("Sent to Lucy");
    expect(db.proposals).toEqual([{ p_booking: BOOKING, p_kind: "drop_off", p_at: "2030-10-05T12:00:00.000Z" }]);
    await expect(screen.getByTestId("proposal-drop_off")).toHaveCount(0);
    // The sitter now sees the owner's counter on their side.
    expect(db.booking_handoffs.find((h) => h.status === "proposed" && h.kind === "drop_off")?.proposed_by).toBe(OWNER.id);
  });

  test("after confirm the owner changes pick-up time and place; a decline keeps the original", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    seed(db, "confirmed", CONFIRMED);
    const screen = await openDetail(page, OWNER);
    await expect(screen.getByTestId("handoff-drop_off")).toContainText("📍 100 Example St");

    await screen.getByTestId("change-booking").click();
    await expect(screen.getByTestId("change-kind-pick_up")).toHaveAttribute("aria-checked", "true");
    for (let i = 0; i < 4; i++) await screen.getByTestId("change-time-plus").click();
    await expect(screen.getByTestId("change-time-value")).toHaveText("6:00 PM");
    await screen.getByTestId("change-place-owner_home").click();
    await screen.getByTestId("change-send").click();

    await expect(screen.getByTestId("toast")).toContainText("Sent to Lucy");
    expect(db.proposals).toEqual([
      {
        p_booking: BOOKING,
        p_kind: "pick_up",
        p_at: "2030-10-08T22:00:00.000Z",
        p_location_type: "owner_home",
        p_note: null,
      },
    ]);
    const pending = screen.getByTestId("proposal-pick_up");
    await expect(pending).toContainText("Change pending");
    await expect(pending).toContainText("You suggested pick-up Oct 8, 6:00 PM · My place.");
    await expect(pending).toContainText("Until Lucy agrees, it stays at Oct 8, 5:00 PM.");
    await expect(screen.getByTestId("handoff-pick_up")).toContainText("Oct 8, 5:00 PM");

    // Lucy declines (respond_handoff false after confirm) → the agreed time stays.
    const offer = db.booking_handoffs.find((h) => h.status === "proposed");
    if (offer) offer.status = "rejected";
    await page.reload();
    await expect(screen.getByTestId("declined-pick_up")).toHaveText("Lucy kept the original time.");
    await expect(screen.getByTestId("proposal-pick_up")).toHaveCount(0);
  });

  test("the sitter accepts the owner's change after confirm", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    seed(db, "confirmed", [
      ...CONFIRMED,
      { kind: "pick_up", at: "2030-10-08T22:00:00.000Z", by: OWNER, status: "proposed", minute: 9, type: "owner_home" },
    ]);
    await signIn(page, SITTER);
    await expect(page).toHaveURL(/\/sitter$/);
    const screen = app(page);
    await screen.getByRole("tab").getByText("Bookings", { exact: true }).click();
    await screen.getByTestId("sitter-bookings-tabs-upcoming").click();
    const card = screen.getByTestId(`booking-card-${BOOKING}`);
    await expect(card).toContainText("Chloe suggested a change");
    await card.click();

    const proposal = screen.getByTestId("proposal-pick_up");
    await expect(proposal).toContainText("Chloe suggested a new pick-up");
    await expect(proposal).toContainText("Oct 8, 6:00 PM · Chloe's place");
    await screen.getByTestId("proposal-pick_up-accept").click();
    await expect(screen.getByTestId("toast")).toContainText("New time agreed with Chloe");
    expect(db.booking_handoffs.find((h) => h.id === "h-2")?.status).toBe("agreed");
    expect(db.booking_handoffs.find((h) => h.id === "h-1")?.status).toBe("superseded");
    await expect(screen.getByTestId("handoff-pick_up")).toContainText("Oct 8, 6:00 PM · Chloe's place");
  });
});
