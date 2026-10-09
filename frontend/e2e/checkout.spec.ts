import { expect, test } from "@playwright/test";

import { app, signIn } from "./helpers";
import { DEMO_QUOTE, MockDb, OWNER, SITTER, mockSupabase } from "./supabaseMock";

// Checkout (phase-03c 3C.7): quote → consents → Pay (demo). One missing consent keeps Pay off.

const BOOKING = "00000000-0000-4000-8000-0000000000e1";
const MAX = "00000000-0000-4000-8000-0000000000c1";

const KINDS = ["emergency_vet", "safe_return", "handoff_rules", "cohabitation"] as const;

function seedUnpaid(db: MockDb) {
  db.pets.push({ id: MAX, owner_id: OWNER.id, species: "dog", name: "Max", breed: "Maltese", notes: null });
  db.sitter_profiles.push({
    id: SITTER.id,
    home_address: "100 Example St",
    visitor_parking: "Visitor spot B-12",
    lobby_notes: "Buzz 1204",
    packing_list: ["food", "bed or cushion", "medications"],
  });
  db.bookings.push({
    id: BOOKING,
    owner_id: OWNER.id,
    sitter_id: SITTER.id,
    status: "confirmed",
    service_type: "boarding",
    meet_greet_status: "done",
    paid_at: null,
    price_snapshot: null,
    created_at: "2026-10-02T18:00:00Z",
  });
  db.booking_pets.push({ booking_id: BOOKING, pet_id: MAX });
  for (const [kind, at] of [
    ["drop_off", "2030-10-09T11:30:00.000Z"],
    ["pick_up", "2030-10-12T21:00:00.000Z"],
  ] as const) {
    db.booking_handoffs.push({
      id: `h-${kind}`,
      booking_id: BOOKING,
      kind,
      scheduled_at: at,
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

test.describe("checkout", () => {
  test("Pay stays disabled until every consent is checked", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    seedUnpaid(db);
    await signIn(page, OWNER);
    await expect(page).toHaveURL(/\/owner$/);
    await page.goto(`/owner/bookings/${BOOKING}`);
    const screen = app(page);

    await expect(screen.getByTestId("checkout-banner")).toContainText("Chloe accepted");
    await screen.getByTestId("open-checkout").click();
    await expect(screen.getByTestId("checkout-title")).toContainText("Finish booking with Chloe");
    await expect(screen.getByTestId("quote-total")).toContainText(`$${DEMO_QUOTE.total.toFixed(2)}`);

    await expect(screen.getByTestId("checkout-pay")).toBeDisabled();

    // Leave one consent unchecked — Pay must stay off (3C.7 DoD).
    for (const kind of KINDS.slice(0, -1)) {
      await screen.getByTestId(`consent-${kind}-check`).click();
      await expect(screen.getByTestId(`consent-${kind}-check`)).toHaveAttribute("aria-checked", "true");
    }
    await expect(screen.getByTestId("checkout-pay")).toBeDisabled();
    expect(db.payments).toHaveLength(0);
  });

  test("a sitter with no prices yet is named as the reason, not 'doesn't offer that service'", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    seedUnpaid(db);
    db.quote_error = "service_not_offered"; // what quote_booking raises with no price row
    await signIn(page, OWNER);
    await expect(page).toHaveURL(/\/owner$/);
    await page.goto(`/owner/bookings/${BOOKING}/checkout`);
    const screen = app(page);

    await expect(screen.getByText("Can't open checkout")).toBeVisible();
    await expect(screen.getByText("hasn't set their prices yet", { exact: false })).toBeVisible();
    await expect(screen.getByText("doesn't offer that service", { exact: false })).toHaveCount(0);
  });

  test("a sitter who has prices but does not offer the service still says so", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    seedUnpaid(db);
    db.sitter_rates.push({ sitter_id: SITTER.id, boarding_nightly: 55 });
    db.quote_error = "service_not_offered";
    await signIn(page, OWNER);
    await expect(page).toHaveURL(/\/owner$/);
    await page.goto(`/owner/bookings/${BOOKING}/checkout`);

    await expect(app(page).getByText("doesn't offer that service", { exact: false })).toBeVisible();
    await expect(app(page).getByText("hasn't set their prices yet", { exact: false })).toHaveCount(0);
  });

  test("checking every consent and Pay completes demo checkout", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    seedUnpaid(db);
    await signIn(page, OWNER);
    await expect(page).toHaveURL(/\/owner$/);
    await page.goto(`/owner/bookings/${BOOKING}/checkout`);
    const screen = app(page);

    await expect(screen.getByTestId("checkout-quote")).toBeVisible();
    for (const kind of KINDS) {
      await screen.getByTestId(`consent-${kind}-check`).click();
    }
    await screen.getByTestId("checkout-signer").fill("Robert");
    await expect(screen.getByTestId("checkout-pay")).toBeEnabled();
    await screen.getByTestId("checkout-pay").click();

    await expect(screen.getByTestId("toast")).toContainText("You're all set");
    expect(db.payments).toEqual([{ p_booking: BOOKING }]);
    expect(db.booking_consents).toHaveLength(KINDS.length);
    expect(db.bookings[0].paid_at).toBeTruthy();
    expect(db.bookings[0].price_snapshot).toEqual(DEMO_QUOTE);

    await expect(page).toHaveURL(new RegExp(`/owner/bookings/${BOOKING}$`));
    await expect(screen.getByText("Paid", { exact: true })).toBeVisible();
    await expect(screen.getByTestId("checkout-banner")).toHaveCount(0);
    await expect(screen.getByTestId("sitter-place-card")).toContainText("100 Example St");
    await expect(screen.getByTestId("packing-list")).toContainText("food");
  });

  test("a change agreed after payment reopens checkout for the new consent only", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    seedReopened(db);
    await signIn(page, OWNER);
    await expect(page).toHaveURL(/\/owner$/);
    await page.goto(`/owner/bookings/${BOOKING}`);
    const screen = app(page);

    await expect(screen.getByTestId("checkout-banner")).toContainText("Your stay changed");
    await expect(screen.getByTestId("checkout-banner")).toContainText("Entry info stays locked for Chloe");
    // Paid once: the sitter's place stays on the booking while checkout is open again (009e).
    await expect(screen.getByTestId("sitter-place-card")).toContainText("100 Example St");
    await screen.getByTestId("open-checkout").click();

    // Signed kinds stay signed; only home_access needs a check.
    for (const kind of KINDS) {
      await expect(screen.getByTestId(`consent-${kind}-signed`)).toBeVisible();
    }
    await expect(screen.getByTestId("checkout-pay")).toBeDisabled();
    await screen.getByTestId("consent-home_access-check").click();
    await screen.getByTestId("checkout-signer").fill("Robert");
    await screen.getByTestId("checkout-pay").click();

    await expect(screen.getByTestId("toast")).toContainText("You're all set");
    expect(db.booking_consents.map((c) => c.kind)).toEqual([...KINDS, "home_access"]);
    expect(db.bookings[0].paid_at).toBeTruthy();
  });

  test("while checkout is reopened the sitter keeps the addresses and sees why the codes are locked", async ({
    page,
  }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    seedReopened(db);
    await signIn(page, SITTER);
    await expect(page).toHaveURL(/\/sitter$/);
    await page.goto(`/sitter/bookings/${BOOKING}`);
    const screen = app(page);

    await expect(screen.getByTestId("handoff-pick_up")).toContainText("1 Owner Ave");
    await expect(screen.getByTestId("entry-info-waiting")).toContainText("Waiting for Robert to sign");
    await expect(screen.getByTestId("entry-codes")).toHaveCount(0);
  });
});

/** 009d: pick-up moved to the owner's home after payment → paid_at cleared, last paid quote kept, home_access missing. */
function seedReopened(db: MockDb) {
  seedUnpaid(db);
  db.bookings[0].price_snapshot = DEMO_QUOTE;
  db.owner_profiles.push({ id: OWNER.id, home_address: "1 Owner Ave" });
  const pickUp = db.booking_handoffs.find((h) => h.kind === "pick_up")!;
  pickUp.location_type = "owner_home";
  for (const kind of KINDS) {
    db.booking_consents.push({
      id: `c-${kind}`,
      booking_id: BOOKING,
      kind,
      version: "1",
      signer_id: OWNER.id,
      signer_name: "Robert",
      details: {},
      signed_at: "2026-10-02T18:05:00Z",
    });
  }
}
