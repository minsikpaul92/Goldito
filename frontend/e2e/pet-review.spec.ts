import { expect, test } from "@playwright/test";

import { NOON_TORONTO, app, signIn } from "./helpers";
import { MockDb, OWNER, SITTER, mockSupabase } from "./supabaseMock";

// Per-pet reviews (#407, 015u): the sitter picks chips for each pet after Returned; the owner and other sitters read them.

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
  for (const [kind, at] of [["drop_off", DROP], ["pick_up", PICK]] as const) {
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
      completed_at: at,
      created_at: "2026-10-02T18:00:00Z",
    });
  }
}

async function start(page: import("@playwright/test").Page) {
  await page.clock.install({ time: NOON_TORONTO });
  await page.clock.resume();
  const { db } = await mockSupabase(page, [OWNER, SITTER], { now: NOON_TORONTO });
  seedFinished(db);
  const asked: unknown[] = [];
  await page.route("**/api/ai/pet-review-chips", (route) => {
    asked.push(route.request().postDataJSON());
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ chips: ["Chased every squirrel", "Loved our walks", "A joy to look after"], source: "ai" }),
    });
  });
  await page.route("**/api/ai/life-record", (route) => route.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
  return { db, asked };
}

function review(id: string, petId: string, chips: string[], note: string | null, createdAt: string) {
  return { id, pet_id: petId, booking_id: BOOKING, sitter_id: SITTER.id, chips, note, stay_from: DROP, stay_to: PICK, created_at: createdAt };
}

test.describe("pet reviews", () => {
  test("the sitter reviews each pet of a finished stay with chips and an optional note", async ({ page }) => {
    const { db, asked } = await start(page);
    await signIn(page, SITTER);
    await page.goto(`/sitter/bookings/${BOOKING}`);
    const screen = app(page);

    await expect(screen.getByTestId("stay-complete")).toBeVisible();
    await screen.getByTestId(`pet-review-start-${MAX}`).click();
    await expect(screen.getByTestId(`pet-review-chip-${MAX}-0`)).toContainText("Chased every squirrel");
    expect(asked).toEqual([{ booking_id: BOOKING, pet_id: MAX }]);
    // Nothing picked, nothing written: Save waits.
    await expect(screen.getByTestId(`pet-review-save-${MAX}`)).toBeDisabled();
    await screen.getByTestId(`pet-review-chip-${MAX}-0`).click();
    await screen.getByTestId(`pet-review-chip-${MAX}-1`).click();
    // The note hides behind "+".
    await expect(screen.getByTestId(`pet-review-note-${MAX}`)).toHaveCount(0);
    await screen.getByTestId(`pet-review-note-open-${MAX}`).click();
    await screen.getByTestId(`pet-review-note-${MAX}`).fill("Sweetest boy");
    await screen.getByTestId(`pet-review-save-${MAX}`).click();

    await expect(screen.getByTestId("toast")).toContainText("Review saved. Robert can see it");
    await expect(screen.getByTestId(`pet-review-${MAX}`)).toContainText("Chased every squirrel · Loved our walks");
    await expect(screen.getByTestId(`pet-review-${MAX}`)).toContainText("Sweetest boy");
    expect(db.pet_reviews).toHaveLength(1);
    expect(db.pet_reviews[0]).toMatchObject({
      pet_id: MAX,
      booking_id: BOOKING,
      sitter_id: SITTER.id,
      chips: ["Chased every squirrel", "Loved our walks"],
      note: "Sweetest boy",
    });
    // Mochi waits for hers.
    await expect(screen.getByTestId(`pet-review-start-${MOCHI}`)).toBeVisible();

    // Editing replaces the review, it does not add a second one.
    await page.reload();
    await screen.getByTestId(`pet-review-edit-${MAX}`).click();
    await screen.getByTestId(`pet-review-chip-${MAX}-1`).click();
    await screen.getByTestId(`pet-review-save-${MAX}`).click();
    await expect(screen.getByTestId(`pet-review-${MAX}`)).not.toContainText("Loved our walks");
    expect(db.pet_reviews).toHaveLength(1);
    expect(db.pet_reviews[0].chips).toEqual(["Chased every squirrel"]);
  });

  test("the chips still come when the AI is down", async ({ page }) => {
    await start(page);
    await page.unroute("**/api/ai/pet-review-chips");
    await page.route("**/api/ai/pet-review-chips", (route) => route.fulfill({ status: 503, contentType: "application/json", body: "{}" }));
    await signIn(page, SITTER);
    await page.goto(`/sitter/bookings/${BOOKING}`);
    await app(page).getByTestId(`pet-review-start-${MOCHI}`).click();
    await expect(app(page).getByTestId(`pet-review-chip-${MOCHI}-0`)).toContainText("A joy to look after");
  });

  test("a stay that is not over has no review", async ({ page }) => {
    const { db } = await start(page);
    db.booking_handoffs.find((h) => h.kind === "pick_up")!.completed_at = null;
    await signIn(page, SITTER);
    await page.goto(`/sitter/bookings/${BOOKING}`);
    await app(page).getByTestId("handoff-check").waitFor();
    await expect(app(page).getByTestId(`pet-review-${MAX}`)).toHaveCount(0);
  });

  test("the owner reads the reviews under the pet room, newest first, only for that pet", async ({ page }) => {
    const { db } = await start(page);
    db.pet_reviews.push(
      review("rev-old", MAX, ["Calm indoors"], null, "2026-09-01T12:00:00Z"),
      review("rev-new", MAX, ["Chased every squirrel"], "Sweetest boy", PICK),
    );
    await signIn(page, OWNER);
    const screen = app(page);
    await screen.getByTestId("home-pager").waitFor();
    await screen.getByTestId("home-pager-tab-1").click();
    await expect(screen.getByTestId("pet-room-Max")).toBeVisible();
    const list = screen.getByTestId(`pet-reviews-${MAX}`);
    await expect(list).toBeVisible();
    await expect(screen.getByTestId("pet-review-row-rev-new")).toContainText("Chloe");
    await expect(screen.getByTestId("pet-review-row-rev-new")).toContainText("Oct 6 to Oct 9");
    await expect(screen.getByTestId("pet-review-row-rev-new")).toContainText("Chased every squirrel");
    await expect(screen.getByTestId("pet-review-row-rev-new")).toContainText("Sweetest boy");
    const ids = await list.locator("[data-testid^='pet-review-row-']").evaluateAll((els) => els.map((e) => e.getAttribute("data-testid")));
    expect(ids).toEqual(["pet-review-row-rev-new", "pet-review-row-rev-old"]);
    await screen.getByTestId("pet-switch").click();
    await screen.getByTestId("pet-switch-menu").getByText("Mochi", { exact: true }).click();
    await expect(screen.getByTestId("pet-room-Mochi")).toBeVisible();
    await expect(screen.getByTestId(`pet-reviews-${MOCHI}`)).toHaveCount(0);
  });

  test("a sitter reads a pet's reviews from other stays on the pet card", async ({ page }) => {
    const { db } = await start(page);
    // Written by another sitter after an earlier stay; this stay's own review is not repeated on the card.
    db.pet_reviews.push(
      { ...review("rev-other", MAX, ["Loved our walks"], null, "2026-09-01T12:00:00Z"), booking_id: "earlier-stay", sitter_id: "00000000-0000-4000-8000-0000000000b9" },
      review("rev-this", MAX, ["Calm indoors"], null, PICK),
    );
    await signIn(page, SITTER);
    await page.goto(`/sitter/bookings/${BOOKING}`);
    const row = app(page).getByTestId("pet-review-row-rev-other");
    await expect(row).toContainText("Loved our walks");
    await expect(row).toContainText("A sitter");
    await expect(app(page).getByTestId("pet-review-row-rev-this")).toHaveCount(0);
    await expect(app(page).getByTestId(`pet-review-${MAX}`)).toContainText("Calm indoors");
  });
});
