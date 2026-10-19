import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { APP_FRAME, app, box, drag, signIn } from "./helpers";
import { MockDb, MockUser, OWNER, SITTER, mockSupabase } from "./supabaseMock";

// Find a sitter (03B SS-2, 3D.1): the start of a new booking — pets, drop-off / pick-up, home or current location and a
// 1–100 km slider (5 km to start). Every change re-searches by itself and the button shows the count; results open on
// the next screen and a result opens the sitter detail. Only sitters free for the whole stay come back (search_sitters_nearby, 014c — the filter itself
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

/** Robert has Max and Mochi and a saved home; Chloe is 3 km away, Paul 4.4 km, Uma 40 km. */
function seed(db: MockDb, { home = true } = {}) {
  db.pets.push(pet(MAX, "Max", "dog"), pet(MOCHI, "Mochi", "cat"));
  // The mock adds role rows on the first request; add Robert's now so his home point is there.
  if (home) db.owner_profiles.push({ id: OWNER.id, home_address: "1 Owner Ave", home_lat: 43.6644, home_lng: -79.3573 });
  db.nearby_sitters.push(nearby(SITTER, 3), nearby(PAUL, 4.4, { boarding_nightly: null, house_sitting_nightly: "70.00" }), nearby(UMA, 40));
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
  test("starts at 5 km, searches by itself and the button shows the count; results list nearest first", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER, PAUL, UMA]);
    seed(db);
    const screen = await openSearch(page);

    await expect(screen.getByTestId("search-pet-Max")).toHaveAttribute("aria-checked", "true");
    await expect(screen.getByTestId("search-pet-Mochi")).toHaveAttribute("aria-checked", "true");
    await expect(screen.getByTestId("radius-value")).toHaveText("5 km");
    await expect(screen.getByTestId("search-submit")).toHaveText("Show 2 sitters");
    expect(db.nearbySearches.at(-1)).toMatchObject({ p_pet_count: 2, p_radius_km: 5, p_lat: null, p_lng: null });
    // Filters and the button fit one phone-size screen, no scrolling.
    const frame = await box(page.locator(APP_FRAME));
    const button = await box(screen.getByTestId("search-submit"));
    expect(button.y + button.height).toBeLessThanOrEqual(frame.y + frame.height);
    await expect(screen.getByTestId("search-result-Chloe")).toHaveCount(0);

    await screen.getByTestId("search-submit").click();
    await expect(screen.getByTestId("search-count")).toContainText("2 sitters");
    await expect(screen.getByTestId("search-result-Chloe-meta")).toHaveText("≈ 3 km away · 🏠 Boarding $55 / night");
    await expect(screen.getByTestId("search-result-Paul-meta")).toHaveText("≈ 4 km away · 🔑 House sitting $70 / night");
    await expect(screen.getByTestId("search-result-Uma")).toHaveCount(0);
    const chloe = await box(screen.getByTestId("search-result-Chloe"));
    const paul = await box(screen.getByTestId("search-result-Paul"));
    expect(chloe.y).toBeLessThan(paul.y);

    await screen.getByTestId("search-edit").click();
    await expect(screen.getByTestId("search-submit")).toHaveText("Show 2 sitters");
  });

  test("moving the slider with the mouse re-searches by itself — drag, track click and keyboard", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER, PAUL, UMA]);
    seed(db);
    const screen = await openSearch(page);
    await expect(screen.getByTestId("search-submit")).toHaveText("Show 2 sitters");
    const calls = db.nearbySearches.length;

    // Drag the thumb to the right end: the value follows the mouse, and one search runs once it rests.
    const slider = screen.getByTestId("radius-slider");
    await slider.scrollIntoViewIfNeeded();
    const track = await box(slider);
    const thumb = await box(screen.getByTestId("radius-slider-thumb"));
    const y = thumb.y + thumb.height / 2;
    await drag(page, { x: thumb.x + thumb.width / 2, y }, { x: track.x + track.width + 30, y }, 15);
    await expect(screen.getByTestId("radius-value")).toHaveText("100 km");
    await expect(screen.getByTestId("search-submit")).toHaveText("Show 3 sitters");
    await page.waitForTimeout(600);
    expect(db.nearbySearches.length).toBe(calls + 1); // debounced: one call for the whole drag
    expect(db.nearbySearches.at(-1)).toMatchObject({ p_radius_km: 100 });

    // A click near the left end of the track jumps there; 3 km is past the line, so nobody and the button is off.
    await page.mouse.click(track.x + 4, track.y + track.height / 2);
    await expect(screen.getByTestId("radius-value")).toHaveText("1 km");
    await expect(screen.getByTestId("search-submit")).toHaveText("No sitters free");
    await expect(screen.getByTestId("search-submit")).toBeDisabled();
    expect(db.nearbySearches.at(-1)).toMatchObject({ p_radius_km: 1 });

    // Keyboard: → +1, Page Up +10.
    await slider.focus();
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("PageUp");
    await expect(screen.getByTestId("radius-value")).toHaveText("12 km");
    await expect(screen.getByTestId("search-submit")).toHaveText("Show 2 sitters");
    expect(db.nearbySearches.at(-1)).toMatchObject({ p_radius_km: 12 });

    // Dragging the slider does not scroll the screen (it owns its drag, DESIGN.md §7.7).
    const before = (await box(slider)).y;
    const t = await box(screen.getByTestId("radius-slider-thumb"));
    await drag(page, { x: t.x + t.width / 2, y: t.y + t.height / 2 }, { x: t.x + t.width / 2 + 40, y: t.y + t.height / 2 - 120 });
    expect((await box(slider)).y).toBeCloseTo(before, 0);
  });

  test("the last radius is remembered", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER, PAUL, UMA]);
    seed(db);
    db.owner_profiles[0].search_radius_km = 20;
    const screen = await openSearch(page);
    await expect(screen.getByTestId("radius-value")).toHaveText("20 km");
    await expect(screen.getByTestId("search-submit")).toHaveText("Show 2 sitters");
    expect(db.nearbySearches.at(-1)).toMatchObject({ p_radius_km: 20 });

    const slider = screen.getByTestId("radius-slider");
    await slider.focus();
    await page.keyboard.press("PageUp");
    await expect(screen.getByTestId("radius-value")).toHaveText("30 km");
    await expect.poll(() => db.owner_profiles[0].search_radius_km).toBe(30);
  });

  test("changing dates, times or pets refreshes the count without a Search button", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER, PAUL, UMA]);
    seed(db);
    const screen = await openSearch(page);
    await expect(screen.getByTestId("search-submit")).toHaveText("Show 2 sitters");
    const calls = db.nearbySearches.length;

    await screen.getByTestId("search-drop_off-time-plus").click();
    await expect.poll(() => db.nearbySearches.length).toBe(calls + 1);
    expect(String(db.nearbySearches.at(-1)?.p_drop_off_at)).toContain("T13:15");

    await screen.getByTestId("search-pet-Mochi").click();
    await expect.poll(() => db.nearbySearches.at(-1)?.p_pet_count).toBe(1);
    await expect(screen.getByTestId("search-submit")).toHaveText("Show 2 sitters");
  });

  test("Where I am now asks the browser once and sends that point", async ({ page }) => {
    await stubGps(page);
    const { db } = await mockSupabase(page, [OWNER, SITTER, PAUL, UMA]);
    seed(db);
    const screen = await openSearch(page);

    await screen.getByTestId("search-place").getByText("📍 Where I am now").click();
    await expect(screen.getByTestId("search-submit")).toBeEnabled();
    expect(db.nearbySearches.at(-1)).toMatchObject({ p_lat: 43.6477, p_lng: -79.4194 });
  });

  test("a blocked location says how to fix it and the button waits", async ({ page }) => {
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

  test("nothing in range: the button is off and Widen searches farther", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER, PAUL, UMA]);
    seed(db);
    db.nearby_sitters.splice(0, 2); // only Uma, 40 km away
    const screen = await openSearch(page);

    await expect(screen.getByTestId("search-submit")).toHaveText("No sitters free");
    await expect(screen.getByTestId("search-submit")).toBeDisabled();
    await screen.getByRole("button", { name: "Widen to 25 km" }).click();
    await expect(screen.getByTestId("radius-value")).toHaveText("25 km");
    await expect(screen.getByTestId("search-submit")).toBeDisabled();
    await screen.getByRole("button", { name: "Widen to 50 km" }).click();
    await expect(screen.getByTestId("search-submit")).toHaveText("Show 1 sitter");
    expect(db.nearbySearches.at(-1)).toMatchObject({ p_radius_km: 50 });
  });

  test("a result opens the sitter detail with the stay", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER, PAUL, UMA]);
    seed(db);
    const screen = await openSearch(page);
    await screen.getByTestId("search-pet-Mochi").click(); // only Max
    await screen.getByTestId("search-drop_off-time-plus").click(); // 9:15 AM
    await expect(screen.getByTestId("search-submit")).toHaveText("Show 2 sitters");
    await screen.getByTestId("search-submit").click();
    await expect(screen.getByTestId("search-book-Chloe")).toHaveCount(0);
    await screen.getByTestId("search-result-Chloe").click();

    await expect(page).toHaveURL(new RegExp(`/owner/sitters/${SITTER.id}\\?`));
    const q = new URL(page.url()).searchParams;
    expect(q.get("pets")).toBe(MAX);
    expect(q.get("drop")).toContain("T13:15");
  });

  test("Book care with a sitter already chosen shows no second sitter list", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER, PAUL, UMA]);
    seed(db);
    const match = (user: MockUser) => ({
      sitter_id: user.id,
      display_name: user.displayName,
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
    db.search_results.push(match(SITTER), match(PAUL));
    await signIn(page, OWNER);
    await expect(page).toHaveURL(/\/owner$/);
    const screen = app(page);
    await page.goto(`/owner/bookings/new?sitter=${SITTER.id}&pets=${MAX}`);
    await expect(screen.getByTestId("pick-sitter-Chloe")).toBeVisible();
    await expect(screen.getByTestId("pick-sitter-Paul")).toHaveCount(0);
    await expect(screen.getByText("Sitters free for your trip")).toHaveCount(0);
  });
});
