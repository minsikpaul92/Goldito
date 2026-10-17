import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { app, box, drag, signIn } from "./helpers";
import { MockDb, MockUser, OWNER, SITTER, mockSupabase } from "./supabaseMock";

// Find a sitter (03B SS-2): the start of a new booking — pets, drop-off / pick-up, home or current location and a
// 1–100 km slider. Only sitters free for the whole stay come back (search_sitters_nearby, 014c — the filter itself
// is tested in rls_smoke.sql); the mock keeps rows within the radius. Everything here is done with the mouse in
// the desktop phone frame.

const PAUL: MockUser = {
  id: "00000000-0000-4000-8000-000000000003",
  email: "paul@goldito.test",
  password: "nap-time",
  role: "sitter",
  displayName: "Paul",
};
const UMA: MockUser = {
  id: "00000000-0000-4000-8000-000000000005",
  email: "uma@goldito.test",
  password: "long-walks",
  role: "sitter",
  displayName: "Uma",
};

const MAX = "00000000-0000-4000-8000-0000000000c1";
const MOCHI = "00000000-0000-4000-8000-0000000000c2";

function pet(id: string, name: string, species: "dog" | "cat") {
  return { id, owner_id: OWNER.id, species, name, breed: null, birthdate: null, weight_kg: null, notes: null, created_at: `2026-01-0${name === "Max" ? 1 : 2}T00:00:00Z` };
}

function nearby(user: MockUser, km: number, extra: Record<string, unknown> = {}) {
  return {
    sitter_id: user.id,
    display_name: user.displayName,
    bio: null,
    service_area: "Toronto",
    experience_years: 3,
    services: ["boarding"],
    is_my_sitter: false,
    accepts_multiple_owners: false,
    distance_km: km,
    boarding_nightly: 55,
    house_sitting_nightly: null,
    ...extra,
  };
}

/** Robert has Max and Mochi and a saved home; Chloe is 3 km away, Paul 6.4 km, Uma 40 km. */
function seed(db: MockDb, { home = true } = {}) {
  db.pets.push(pet(MAX, "Max", "dog"), pet(MOCHI, "Mochi", "cat"));
  // The mock adds role rows on the first request; add Robert's now so his home point is there.
  if (home) db.owner_profiles.push({ id: OWNER.id, home_address: "1 Owner Ave", home_lat: 43.6644, home_lng: -79.3573 });
  db.nearby_sitters.push(nearby(SITTER, 3), nearby(PAUL, 6.4, { boarding_nightly: null, house_sitting_nightly: "70.00" }), nearby(UMA, 40));
}

async function openSearch(page: Page) {
  await signIn(page, OWNER);
  await expect(page).toHaveURL(/\/owner$/);
  const screen = app(page);
  await screen.getByRole("tab").getByText("Bookings", { exact: true }).click();
  await screen.getByTestId("book-care").click();
  await expect(page).toHaveURL(/\/owner\/bookings\/search$/);
  return screen;
}

/** Replaces navigator.geolocation in every frame; `deny` answers "permission denied". */
async function stubGps(page: Page, deny = false) {
  await page.addInitScript((denied) => {
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition(ok: (p: unknown) => void, fail: (e: unknown) => void) {
          if (denied) fail({ code: 1 });
          else ok({ coords: { latitude: 43.6477, longitude: -79.4194 } });
        },
        watchPosition: () => 1,
        clearWatch: () => undefined,
      },
    });
  }, deny);
}

test.describe("find a sitter", () => {
  test("Book care opens the search; Search lists sitters free for the stay, nearest first, with distance and price", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER, PAUL, UMA]);
    seed(db);
    const screen = await openSearch(page);

    await expect(screen.getByTestId("search-pet-Max")).toHaveAttribute("aria-checked", "true");
    await expect(screen.getByTestId("search-pet-Mochi")).toHaveAttribute("aria-checked", "true");
    await expect(screen.getByTestId("radius-value")).toHaveText("10 km");
    expect(db.nearbySearches).toHaveLength(0); // nothing runs before Search

    await screen.getByTestId("search-submit").click();
    await expect(screen.getByTestId("search-count")).toHaveText("2 sitters free for your whole stay");
    expect(db.nearbySearches.at(-1)).toMatchObject({ p_pet_count: 2, p_radius_km: 10, p_lat: null, p_lng: null });
    await expect(screen.getByTestId("search-result-Chloe-meta")).toHaveText("≈ 3 km away · 🏠 Boarding $55 / night");
    await expect(screen.getByTestId("search-result-Paul-meta")).toHaveText("≈ 6 km away · 🔑 House sitting $70 / night");
    await expect(screen.getByTestId("search-result-Uma")).toHaveCount(0);
    const chloe = await box(screen.getByTestId("search-result-Chloe"));
    const paul = await box(screen.getByTestId("search-result-Paul"));
    expect(chloe.y).toBeLessThan(paul.y);
  });

  test("moving the slider with the mouse re-searches by itself — drag, track click and keyboard", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER, PAUL, UMA]);
    seed(db);
    const screen = await openSearch(page);
    await screen.getByTestId("search-submit").click();
    await expect(screen.getByTestId("search-count")).toHaveText("2 sitters free for your whole stay");
    const calls = db.nearbySearches.length;

    // Drag the thumb to the right end: the value follows the mouse, and one search runs once it rests.
    const slider = screen.getByTestId("radius-slider");
    await slider.scrollIntoViewIfNeeded();
    const track = await box(slider);
    const thumb = await box(screen.getByTestId("radius-slider-thumb"));
    const y = thumb.y + thumb.height / 2;
    await drag(page, { x: thumb.x + thumb.width / 2, y }, { x: track.x + track.width + 30, y }, 15);
    await expect(screen.getByTestId("radius-value")).toHaveText("100 km");
    await expect(screen.getByTestId("search-result-Uma")).toBeVisible();
    await expect(screen.getByTestId("search-count")).toHaveText("3 sitters free for your whole stay");
    await page.waitForTimeout(600);
    expect(db.nearbySearches.length).toBe(calls + 1); // debounced: one call for the whole drag
    expect(db.nearbySearches.at(-1)).toMatchObject({ p_radius_km: 100 });

    // A click near the left end of the track jumps there.
    await page.mouse.click(track.x + 4, track.y + track.height / 2);
    await expect(screen.getByTestId("radius-value")).toHaveText("1 km");
    await expect(screen.getByTestId("search-result-Chloe")).toHaveCount(0); // 3 km is past the line: the radius is exact
    await expect(screen.getByText("No sitter free within 1 km")).toBeVisible();
    expect(db.nearbySearches.at(-1)).toMatchObject({ p_radius_km: 1 });

    // Keyboard: → +1, Page Up +10.
    await slider.focus();
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("PageUp");
    await expect(screen.getByTestId("radius-value")).toHaveText("12 km");
    await expect(screen.getByTestId("search-result-Paul")).toBeVisible();
    expect(db.nearbySearches.at(-1)).toMatchObject({ p_radius_km: 12 });

    // Dragging the slider does not scroll the screen (it owns its drag, DESIGN.md §7.7).
    const before = (await box(slider)).y;
    const t = await box(screen.getByTestId("radius-slider-thumb"));
    await drag(page, { x: t.x + t.width / 2, y: t.y + t.height / 2 }, { x: t.x + t.width / 2 + 40, y: t.y + t.height / 2 - 120 });
    expect((await box(slider)).y).toBeCloseTo(before, 0);
  });

  test("changing the stay asks for Search again instead of searching by itself", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER, PAUL, UMA]);
    seed(db);
    const screen = await openSearch(page);
    await screen.getByTestId("search-submit").click();
    await expect(screen.getByTestId("search-count")).toBeVisible();
    const calls = db.nearbySearches.length;

    await screen.getByTestId("search-drop_off-time-plus").click();
    await expect(screen.getByTestId("search-changed")).toBeVisible();
    await page.waitForTimeout(600);
    expect(db.nearbySearches.length).toBe(calls);
    await screen.getByTestId("search-submit").click();
    await expect(screen.getByTestId("search-changed")).toHaveCount(0);
    expect(db.nearbySearches.length).toBe(calls + 1);

    await screen.getByTestId("search-pet-Mochi").click();
    await screen.getByTestId("search-submit").click();
    expect(db.nearbySearches.at(-1)).toMatchObject({ p_pet_count: 1 });
  });

  test("Where I am now asks the browser once and sends that point", async ({ page }) => {
    await stubGps(page);
    const { db } = await mockSupabase(page, [OWNER, SITTER, PAUL, UMA]);
    seed(db);
    const screen = await openSearch(page);

    await screen.getByTestId("search-place").getByText("📍 Where I am now").click();
    await expect(screen.getByTestId("search-located")).toBeVisible();
    await screen.getByTestId("search-submit").click();
    await expect(screen.getByTestId("search-count")).toBeVisible();
    expect(db.nearbySearches.at(-1)).toMatchObject({ p_lat: 43.6477, p_lng: -79.4194 });
  });

  test("a blocked location says how to fix it and Search waits", async ({ page }) => {
    await stubGps(page, true);
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    seed(db);
    const screen = await openSearch(page);

    await screen.getByTestId("search-place").getByText("📍 Where I am now").click();
    await expect(screen.getByTestId("search-location-error")).toContainText("Location is blocked for this site");
    await expect(screen.getByTestId("search-submit")).toBeDisabled();
  });

  test("no saved home: the screen says so and offers Profile or the current location", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    seed(db, { home: false });
    const screen = await openSearch(page);

    await expect(screen.getByTestId("search-no-home")).toContainText("Your home isn't on the map yet");
    await expect(screen.getByTestId("search-submit")).toBeDisabled();
    await expect(screen.getByTestId("search-open-profile")).toBeVisible();
  });

  test("nothing in range: the empty state says what to change and Widen searches farther", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER, PAUL, UMA]);
    seed(db);
    db.nearby_sitters.splice(0, 2); // only Uma, 40 km away
    const screen = await openSearch(page);

    await screen.getByTestId("search-submit").click();
    await expect(screen.getByText("No sitter free within 10 km")).toBeVisible();
    await expect(screen.getByText(/Try a wider radius, other dates or other times/)).toBeVisible();
    await screen.getByRole("button", { name: "Widen to 25 km" }).click();
    await expect(screen.getByTestId("radius-value")).toHaveText("25 km");
    await expect(screen.getByText("No sitter free within 25 km")).toBeVisible();
    await screen.getByRole("button", { name: "Widen to 50 km" }).click();
    await expect(screen.getByTestId("search-result-Uma")).toBeVisible();
    expect(db.nearbySearches.at(-1)).toMatchObject({ p_radius_km: 50 });
  });

  test("Book opens Book care with the sitter, the stay and the pets filled in", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER, PAUL, UMA]);
    seed(db);
    // Book care's own search (search_sitters) knows Chloe for the whole trip.
    db.search_results.push({
      sitter_id: SITTER.id,
      display_name: SITTER.displayName,
      bio: null,
      service_area: null,
      experience_years: null,
      services: ["boarding"],
      is_my_sitter: false,
      covered_slots: 11,
      total_slots: 11,
      drop_off_within_hours: true,
      pick_up_within_hours: true,
    });
    const screen = await openSearch(page);
    await screen.getByTestId("search-pet-Mochi").click(); // only Max
    await screen.getByTestId("search-drop_off-time-plus").click(); // 9:15 AM
    await screen.getByTestId("search-submit").click();
    await screen.getByTestId("search-book-Chloe").click();

    await expect(page).toHaveURL(/\/owner\/bookings\/new\?/);
    expect(new URL(page.url()).searchParams.get("sitter")).toBe(SITTER.id);
    await expect(screen.getByTestId("pick-pet-Max")).toHaveAttribute("aria-checked", "true");
    await expect(screen.getByTestId("pick-pet-Mochi")).toHaveAttribute("aria-checked", "false");
    await expect(screen.getByTestId("drop_off-time-value")).toHaveText("9:15 AM");
    await expect(screen.getByTestId("pick_up-time-value")).toHaveText("5:00 PM");
    await expect(screen.getByTestId("request-booking")).toHaveText("Request booking with Chloe");
  });
});
