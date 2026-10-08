import { expect, test } from "@playwright/test";

import { app, signIn } from "./helpers";
import { MockDb, MockUser, OWNER, SITTER, mockSupabase } from "./supabaseMock";

// Book care (phase-03b 3B.3): pets → times + places → your sitters / search → request.

const PAUL: MockUser = {
  id: "00000000-0000-4000-8000-000000000003",
  email: "paul@pawddy.test",
  password: "nap-time",
  role: "sitter",
  displayName: "Paul",
};
const ALLEN: MockUser = {
  id: "00000000-0000-4000-8000-000000000004",
  email: "allen@pawddy.test",
  password: "zoomies",
  role: "sitter",
  displayName: "Allen",
};

const MAX = "00000000-0000-4000-8000-0000000000c1";
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
    created_at: `2026-01-0${name === "Max" ? 1 : 2}T00:00:00Z`,
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

/** Lucy is "your sitter" (a past confirmed booking); Paul is free but starts later; Allen covers part. */
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
    match(PAUL, 11, { drop_off_within_hours: false }),
    match(ALLEN, 3),
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
  test("an owner books Lucy for Max and Mochi", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER, PAUL, ALLEN]);
    seed(db, [pet(MAX, "Max", "dog"), pet(MOCHI, "Mochi", "cat")]);
    await signIn(page, OWNER);
    await expect(page).toHaveURL(/\/owner$/);
    const screen = app(page);

    await screen.getByRole("tab").getByText("Bookings", { exact: true }).click();
    await screen.getByTestId("book-care").click();
    await expect(page).toHaveURL(/\/owner\/bookings\/new$/);

    await expect(screen.getByTestId("trip-problem")).toHaveText("Pick at least one pet.");
    await screen.getByTestId("pick-pet-Max").click();
    await screen.getByTestId("pick-pet-Mochi").click();
    await expect(screen.getByTestId("sitter-options")).toBeVisible();
    expect(db.searches.at(-1)).toMatchObject({ p_pet_count: 2 });

    await expect(screen.getByTestId("pick-sitter-Lucy")).toContainText("Available for your whole trip");
    await expect(screen.getByTestId("pick-sitter-Paul")).toContainText("outside Paul's hours — you can still ask");
    await expect(screen.getByTestId("pick-sitter-Allen")).toHaveCount(0);
    await screen.getByTestId("toggle-partial").click();
    await expect(screen.getByTestId("pick-sitter-Allen")).toContainText("Covers part of your trip");
    await expect(screen.getByTestId("pick-sitter-Allen")).toHaveAttribute("aria-disabled", "true");

    await expect(screen.getByTestId("request-booking")).toBeDisabled();
    await screen.getByTestId("pick-sitter-Lucy").click();
    await expect(screen.getByTestId("pick-sitter-Lucy")).toHaveAttribute("aria-checked", "true");
    await expect(screen.getByTestId("drop_off-place-sitter_home")).toContainText("at Lucy's place");

    // Drop-off 9:00 → 9:30 AM; Lucy brings them home.
    await screen.getByTestId("drop_off-time-plus").click();
    await screen.getByTestId("drop_off-time-plus").click();
    await expect(screen.getByTestId("drop_off-time-value")).toHaveText("9:30 AM");
    await screen.getByTestId("pick_up-place-owner_home").click();
    await screen.getByTestId("booking-note").fill("Max gets anxious with loud noises");

    await expect(screen.getByTestId("request-booking")).toHaveText("Request booking with Lucy");
    await screen.getByTestId("request-booking").click();
    await expect(screen.getByTestId("toast")).toContainText("Request sent to Lucy");
    await expect(page).toHaveURL(/\/owner\/bookings$/);

    expect(db.requests).toHaveLength(1);
    const sent = db.requests[0];
    expect(sent).toMatchObject({
      p_sitter: SITTER.id,
      p_drop_off_location_type: "sitter_home",
      p_pick_up_location_type: "owner_home",
      p_note: "Max gets anxious with loud noises",
      p_service_type: "boarding",
    });
    expect([...(sent.p_pets as string[])].sort()).toEqual([MAX, MOCHI]);
    expect(torontoTime(String(sent.p_drop_off_at))).toBe("09:30");
    expect(torontoTime(String(sent.p_pick_up_at))).toBe("17:00");

    const card = screen.getByTestId(`booking-card-${db.bookings.at(-1)?.id}`);
    await expect(card).toContainText("Requested");
    await expect(card).toContainText("Max");
    await expect(card).toContainText("Mochi");
    await expect(card).toContainText("9:30 AM · Lucy's place");
    await expect(card).toContainText("5:00 PM · My place");
  });

  test("tapping the date opens a calendar; a tap picks the day and − / + still nudge it", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER, PAUL, ALLEN]);
    seed(db, [pet(MAX, "Max", "dog")]);
    await signIn(page, OWNER);
    await expect(page).toHaveURL(/\/owner$/);
    await page.goto("/owner/bookings/new");
    const screen = app(page);

    const dropDay = screen.getByTestId("drop_off-day-value");
    const start = await dropDay.innerText();
    await screen.getByTestId("drop_off-day-open").click();
    const sheet = screen.getByTestId("drop_off-calendar");
    await expect(sheet).toBeVisible();
    // Next month, then its 15th: never the default drop-off (tomorrow), whatever day the test runs.
    await screen.getByTestId("drop_off-calendar-next").click();
    await sheet.locator('[data-testid^="drop_off-calendar-20"][data-testid$="-15"]').click();
    await expect(sheet).toHaveCount(0);
    expect(await dropDay.innerText()).not.toBe(start);

    // The − button still works from the picked day.
    const picked = await dropDay.innerText();
    await screen.getByTestId("drop_off-day-minus").click();
    expect(await dropDay.innerText()).not.toBe(picked);
  });

  test("somewhere else needs a place, and a double booking names the pet", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER, PAUL, ALLEN]);
    seed(db, [pet(MAX, "Max", "dog")]);
    db.search_results[0].request_error = "pet_already_booked";
    await signIn(page, OWNER);
    await expect(page).toHaveURL(/\/owner$/);
    await page.goto("/owner/bookings/new");
    const screen = app(page);

    // The only pet is picked for you.
    await expect(screen.getByTestId("pick-pet-Max")).toHaveAttribute("aria-checked", "true");
    await screen.getByTestId("pick-sitter-Lucy").click();
    await screen.getByTestId("drop_off-place-other").click();
    await expect(screen.getByText("Tell the sitter where to meet.")).toBeVisible();
    await expect(screen.getByTestId("request-booking")).toBeDisabled();
    await screen.getByTestId("drop_off-note").fill("Trinity Bellwoods Park, north gate");
    await expect(screen.getByTestId("request-booking")).toBeEnabled();

    await screen.getByTestId("request-booking").click();
    await expect(screen.getByTestId("booking-error")).toHaveText(
      "Max already has a sitter (or a pending request) at that time.",
    );
    expect(db.requests[0]).toMatchObject({
      p_drop_off_location_type: "other",
      p_drop_off_note: "Trinity Bellwoods Park, north gate",
    });
    await expect(page).toHaveURL(/\/owner\/bookings\/new$/);
  });

  test("house sitting fixes both handoffs at home and skips sitters who don't offer it", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER, PAUL, ALLEN]);
    seed(db, [pet(MAX, "Max", "dog")]);
    const paul = db.search_results.find((r) => r.sitter_id === PAUL.id);
    if (paul) Object.assign(paul, { services: ["boarding", "house_sitting"], drop_off_within_hours: true });
    await signIn(page, OWNER);
    await expect(page).toHaveURL(/\/owner$/);
    await page.goto("/owner/bookings/new");
    const screen = app(page);

    await screen.getByTestId("service-house_sitting").click();
    await expect(screen.getByTestId("drop_off-place-fixed")).toContainText("comes to my place");
    await expect(screen.getByTestId("pick_up-place-fixed")).toHaveText("🔑 At my place");
    await expect(screen.getByTestId("drop_off-place-sitter_home")).toHaveCount(0);

    await expect(screen.getByTestId("pick-sitter-Lucy")).toContainText("Doesn't offer house sitting");
    await expect(screen.getByTestId("pick-sitter-Lucy")).toHaveAttribute("aria-disabled", "true");
    await screen.getByTestId("pick-sitter-Paul").click();
    await expect(screen.getByTestId("drop_off-place-fixed")).toHaveText("🔑 Paul comes to my place");
    await screen.getByTestId("request-booking").click();

    await expect(screen.getByTestId("toast")).toContainText("Request sent to Paul");
    expect(db.requests[0]).toMatchObject({
      p_sitter: PAUL.id,
      p_service_type: "house_sitting",
      p_drop_off_location_type: "owner_home",
      p_pick_up_location_type: "owner_home",
    });
    const card = screen.getByTestId(`booking-card-${db.bookings.at(-1)?.id}`);
    await expect(card).toContainText("🔑 House sitting");
    await expect(card).toContainText("Paul cares for them at your place");
  });

  test("Book this sitter picks the sitter for you", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER, PAUL, ALLEN]);
    seed(db, [pet(MAX, "Max", "dog")]);
    await signIn(page, OWNER);
    await expect(page).toHaveURL(/\/owner$/);
    await page.goto(`/owner/sitters/${SITTER.id}`);
    const screen = app(page);

    await screen.getByTestId("book-this-sitter").click();
    await expect(page).toHaveURL(new RegExp(`/owner/bookings/new\\?sitter=${SITTER.id}$`));
    await expect(screen.getByTestId("pick-sitter-Lucy")).toHaveAttribute("aria-checked", "true");
    await expect(screen.getByTestId("request-booking")).toHaveText("Request booking with Lucy");
  });

  test("no sitter free for the whole trip says so, and no pets asks for one", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, ALLEN]);
    db.pets.push(pet(MAX, "Max", "dog"));
    db.search_results.push(match(ALLEN, 3));
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
