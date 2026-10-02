import { expect, test } from "@playwright/test";

import { app, signIn } from "./helpers";
import { MockDb, MockUser, OWNER, SITTER, mockSupabase } from "./supabaseMock";

// Book care (phase-03b 3B.3): pets → times + places → your sitters / search → request.

const JUN: MockUser = {
  id: "00000000-0000-4000-8000-000000000003",
  email: "jun@pawnote.test",
  password: "nap-time",
  role: "sitter",
  displayName: "Jun",
};
const SORA: MockUser = {
  id: "00000000-0000-4000-8000-000000000004",
  email: "sora@pawnote.test",
  password: "zoomies",
  role: "sitter",
  displayName: "Sora",
};

const BORI = "00000000-0000-4000-8000-0000000000c1";
const MOCHI = "00000000-0000-4000-8000-0000000000c2";

function pet(id: string, name: string, species: "dog" | "cat") {
  return {
    id,
    owner_id: OWNER.id,
    species,
    name,
    breed: null,
    birthdate: null,
    weight_kg: null,
    notes: null,
    created_at: `2026-01-0${name === "Bori" ? 1 : 2}T00:00:00Z`,
  };
}

function match(user: MockUser, covered: number, extra: Record<string, unknown> = {}) {
  return {
    sitter_id: user.id,
    display_name: user.displayName,
    bio: null,
    service_area: null,
    experience_years: null,
    services: ["boarding"],
    is_my_sitter: user.id === SITTER.id,
    covered_slots: covered,
    total_slots: 11,
    drop_off_within_hours: true,
    pick_up_within_hours: true,
    ...extra,
  };
}

/** Mina is "your sitter" (a past confirmed booking); Jun is free but starts later; Sora covers part. */
function seed(db: MockDb, pets: ReturnType<typeof pet>[]) {
  db.pets.push(...pets);
  db.bookings.push({
    id: "00000000-0000-4000-8000-0000000000e9",
    owner_id: OWNER.id,
    sitter_id: SITTER.id,
    status: "confirmed",
    responded_at: "2026-09-01T00:00:00Z",
    created_at: "2026-09-01T00:00:00Z",
  });
  db.search_results.push(
    match(SITTER, 11),
    match(JUN, 11, { drop_off_within_hours: false }),
    match(SORA, 3),
  );
}

function torontoTime(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(iso));
}

test.describe("book care", () => {
  test("an owner books Mina for Bori and Mochi", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER, JUN, SORA]);
    seed(db, [pet(BORI, "Bori", "dog"), pet(MOCHI, "Mochi", "cat")]);
    await signIn(page, OWNER);
    await expect(page).toHaveURL(/\/owner$/);
    const screen = app(page);

    await screen.getByRole("tab").getByText("Bookings", { exact: true }).click();
    await screen.getByTestId("book-care").click();
    await expect(page).toHaveURL(/\/owner\/bookings\/new$/);

    await expect(screen.getByTestId("trip-problem")).toHaveText("Pick at least one pet.");
    await screen.getByTestId("pick-pet-Bori").click();
    await screen.getByTestId("pick-pet-Mochi").click();
    await expect(screen.getByTestId("sitter-options")).toBeVisible();
    expect(db.searches.at(-1)).toMatchObject({ p_pet_count: 2 });

    await expect(screen.getByTestId("pick-sitter-Mina")).toContainText("Available for your whole trip");
    await expect(screen.getByTestId("pick-sitter-Jun")).toContainText("outside Jun's hours — you can still ask");
    await expect(screen.getByTestId("pick-sitter-Sora")).toHaveCount(0);
    await screen.getByTestId("toggle-partial").click();
    await expect(screen.getByTestId("pick-sitter-Sora")).toContainText("Covers part of your trip");
    await expect(screen.getByTestId("pick-sitter-Sora")).toHaveAttribute("aria-disabled", "true");

    await expect(screen.getByTestId("request-booking")).toBeDisabled();
    await screen.getByTestId("pick-sitter-Mina").click();
    await expect(screen.getByTestId("pick-sitter-Mina")).toHaveAttribute("aria-checked", "true");
    await expect(screen.getByTestId("drop_off-place-sitter_home")).toContainText("at Mina's place");

    // Drop-off 9:00 → 9:30 AM; Mina brings them home.
    await screen.getByTestId("drop_off-time-plus").click();
    await screen.getByTestId("drop_off-time-plus").click();
    await expect(screen.getByTestId("drop_off-time-value")).toHaveText("9:30 AM");
    await screen.getByTestId("pick_up-place-owner_home").click();
    await screen.getByTestId("booking-note").fill("Bori gets anxious with loud noises");

    await expect(screen.getByTestId("request-booking")).toHaveText("Request booking with Mina");
    await screen.getByTestId("request-booking").click();
    await expect(screen.getByTestId("toast")).toContainText("Request sent to Mina");
    await expect(page).toHaveURL(/\/owner\/bookings$/);

    expect(db.requests).toHaveLength(1);
    const sent = db.requests[0];
    expect(sent).toMatchObject({
      p_sitter: SITTER.id,
      p_drop_off_location_type: "sitter_home",
      p_pick_up_location_type: "owner_home",
      p_note: "Bori gets anxious with loud noises",
      p_service_type: "boarding",
    });
    expect([...(sent.p_pets as string[])].sort()).toEqual([BORI, MOCHI]);
    expect(torontoTime(String(sent.p_drop_off_at))).toBe("09:30");
    expect(torontoTime(String(sent.p_pick_up_at))).toBe("17:00");

    const card = screen.getByTestId(`booking-card-${db.bookings.at(-1)?.id}`);
    await expect(card).toContainText("Requested");
    await expect(card).toContainText("Bori");
    await expect(card).toContainText("Mochi");
    await expect(card).toContainText("9:30 AM · Mina's place");
    await expect(card).toContainText("5:00 PM · My place");
  });

  test("somewhere else needs a place, and a double booking names the pet", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER, JUN, SORA]);
    seed(db, [pet(BORI, "Bori", "dog")]);
    db.search_results[0].request_error = "pet_already_booked";
    await signIn(page, OWNER);
    await expect(page).toHaveURL(/\/owner$/);
    await page.goto("/owner/bookings/new");
    const screen = app(page);

    // The only pet is picked for you.
    await expect(screen.getByTestId("pick-pet-Bori")).toHaveAttribute("aria-checked", "true");
    await screen.getByTestId("pick-sitter-Mina").click();
    await screen.getByTestId("drop_off-place-other").click();
    await expect(screen.getByText("Tell the sitter where to meet.")).toBeVisible();
    await expect(screen.getByTestId("request-booking")).toBeDisabled();
    await screen.getByTestId("drop_off-note").fill("Trinity Bellwoods Park, north gate");
    await expect(screen.getByTestId("request-booking")).toBeEnabled();

    await screen.getByTestId("request-booking").click();
    await expect(screen.getByTestId("booking-error")).toHaveText(
      "Bori already has a sitter (or a pending request) at that time.",
    );
    expect(db.requests[0]).toMatchObject({
      p_drop_off_location_type: "other",
      p_drop_off_note: "Trinity Bellwoods Park, north gate",
    });
    await expect(page).toHaveURL(/\/owner\/bookings\/new$/);
  });

  test("Book this sitter picks the sitter for you", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER, JUN, SORA]);
    seed(db, [pet(BORI, "Bori", "dog")]);
    await signIn(page, OWNER);
    await expect(page).toHaveURL(/\/owner$/);
    await page.goto(`/owner/sitters/${SITTER.id}`);
    const screen = app(page);

    await screen.getByTestId("book-this-sitter").click();
    await expect(page).toHaveURL(new RegExp(`/owner/bookings/new\\?sitter=${SITTER.id}$`));
    await expect(screen.getByTestId("pick-sitter-Mina")).toHaveAttribute("aria-checked", "true");
    await expect(screen.getByTestId("request-booking")).toHaveText("Request booking with Mina");
  });

  test("no sitter free for the whole trip says so, and no pets asks for one", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SORA]);
    db.pets.push(pet(BORI, "Bori", "dog"));
    db.search_results.push(match(SORA, 3));
    await signIn(page, OWNER);
    await expect(page).toHaveURL(/\/owner$/);
    await page.goto("/owner/bookings/new");
    const screen = app(page);
    await expect(screen.getByTestId("no-whole-trip")).toBeVisible();
    await expect(screen.getByTestId("request-booking")).toBeDisabled();

    db.pets.splice(0);
    await page.goto("/owner/bookings/new");
    await expect(screen.getByText("Add a pet first")).toBeVisible();
  });
});
