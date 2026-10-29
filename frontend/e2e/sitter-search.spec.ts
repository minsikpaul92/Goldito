import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { app, box, signIn } from "./helpers";
import { MockDb, MockUser, OWNER, SITTER, mockSupabase } from "./supabaseMock";

// Bookings tab sitter search (03D 3D.1): one hotel-style line (place, dates, pets), favorites first as photo and name,
// everyone nearby after Search; every change re-searches by itself (search_sitters_nearby, 014c / 014i — the filter
// itself is tested in rls_smoke.sql; the mock keeps rows within the radius). A tile opens the sitter detail.
// Everything is done with the mouse in the desktop phone frame.

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

/** Robert has Max and Mochi and a saved home; Chloe (his favorite) is 3 km away, Paul 4.4 km, Uma 40 km. */
function seed(db: MockDb, { home = true } = {}) {
  db.pets.push(pet(MAX, "Max", "dog"), pet(MOCHI, "Mochi", "cat"));
  // The mock adds role rows on the first request; add Robert's now so his home point is there.
  if (home) db.owner_profiles.push({ id: OWNER.id, home_address: "1 Owner Ave", home_lat: 43.6644, home_lng: -79.3573 });
  db.owner_favorite_sitters.push({ owner_id: OWNER.id, sitter_id: SITTER.id });
  db.nearby_sitters.push(nearby(SITTER, 3), nearby(PAUL, 4.4, { boarding_nightly: null, house_sitting_nightly: "70.00" }), nearby(UMA, 40));
}

async function openBookings(page: Page) {
  await signIn(page, OWNER);
  await expect(page).toHaveURL(/\/owner$/);
  const screen = app(page);
  await screen.getByRole("tab").getByText("Bookings", { exact: true }).click();
  await expect(page).toHaveURL(/\/owner\/bookings$/);
  return screen;
}

/** The app's "today" in Toronto plus n days. */
/** Taps a day on the stay calendar, turning to the next month first when the day is not on the one shown. */
async function pickStayDay(screen: ReturnType<typeof app>, day: string) {
  const cell = screen.getByTestId(`stay-calendar-${day}`);
  if (!(await cell.isVisible())) await screen.getByTestId("stay-calendar-next").click();
  await cell.click();
}

function inDays(n: number): string {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Toronto" });
  const d = new Date(`${today}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
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
  test("a sitter with reviews has the rating next to the name; one without has none", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER, PAUL, UMA]);
    seed(db);
    // Chloe (favorite) has two reviews; Paul has none.
    db.reviews.push(
      { id: "rv1", booking_id: "b-a", owner_id: OWNER.id, sitter_id: SITTER.id, rating: 5, comment: null, created_at: "2026-10-01T10:00:00Z" },
      { id: "rv2", booking_id: "b-b", owner_id: OWNER.id, sitter_id: SITTER.id, rating: 4, comment: null, created_at: "2026-10-02T10:00:00Z" },
    );
    const screen = await openBookings(page);
    await expect(screen.getByTestId("sitter-favorites").getByTestId("sitter-tile-Chloe")).toBeVisible();
    await expect(screen.getByTestId("sitter-rating-Chloe")).toHaveText("★ 4.5");
    await expect(screen.getByTestId("sitter-tile-Paul")).toBeVisible();
    await expect(screen.getByTestId("sitter-rating-Paul")).toHaveCount(0);
    // A favorite wears the same heart as on the sitter's page, not a star.
    await expect(screen.getByTestId("sitter-heart-Chloe")).toBeVisible();
    await expect(screen.getByTestId("sitter-heart-Paul")).toHaveCount(0);
  });

  test("a heart on a sitter's page shows under Favorites at once, and removing it moves them back (#267)", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER, PAUL, UMA]);
    seed(db);
    db.sitter_profiles.push(
      { id: SITTER.id, bio: null, service_area: "Toronto", experience_years: 3, services: ["boarding"] },
      { id: PAUL.id, bio: null, service_area: "Toronto", experience_years: 3, services: ["house_sitting"] },
    );
    const screen = await openBookings(page);
    await expect(screen.getByTestId("sitter-nearby").getByTestId("sitter-tile-Paul")).toBeVisible();

    // Heart Paul on his page, then back: he is a favorite now, without a reload.
    await screen.getByTestId("sitter-tile-Paul").click();
    await expect(page).toHaveURL(new RegExp(`/owner/sitters/${PAUL.id}(\\?|$)`));
    await screen.getByTestId("sitter-favorite").click();
    await expect(screen.getByTestId("toast")).toContainText("Added to favorites");
    const searches = db.nearbySearches.length;
    await page.goBack();
    // #371: back on a tab, the toast still showing sits just above the tab bar, not on it.
    const toast = await box(screen.getByTestId("toast"));
    const tab = await box(screen.getByRole("tab").first());
    expect(toast.y + toast.height).toBeLessThanOrEqual(tab.y);
    await expect(page).toHaveURL(/\/owner\/bookings$/);
    await expect(screen.getByTestId("sitter-favorites").getByTestId("sitter-tile-Paul")).toBeVisible();
    await expect(screen.getByTestId("sitter-nearby").getByTestId("sitter-tile-Paul")).toHaveCount(0);
    // It searched again, so a favorite beyond the radius would show too (014i).
    await expect.poll(() => db.nearbySearches.length).toBeGreaterThan(searches);

    // Take the heart off Chloe: she goes back to Sitters nearby.
    await screen.getByTestId("sitter-favorites").getByTestId("sitter-tile-Chloe").click();
    await expect(page).toHaveURL(new RegExp(`/owner/sitters/${SITTER.id}(\\?|$)`));
    await screen.getByTestId("sitter-favorite").click();
    await expect(screen.getByTestId("toast")).toContainText("Removed from favorites");
    await page.goBack();
    await expect(screen.getByTestId("sitter-nearby").getByTestId("sitter-tile-Chloe")).toBeVisible();
    await expect(screen.getByTestId("sitter-favorites").getByTestId("sitter-tile-Chloe")).toHaveCount(0);
  });

  test("a favorite beyond the radius is listed (014i)", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER, PAUL, UMA]);
    seed(db);
    db.owner_favorite_sitters.push({ owner_id: OWNER.id, sitter_id: UMA.id });
    const screen = await openBookings(page);
    await expect(screen.getByTestId("sitter-favorites").getByTestId("sitter-tile-Uma")).toBeVisible();
  });

  test("opens on one line: favorites on top, then the other sitters free for the stay, with no Search button", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER, PAUL, UMA]);
    seed(db);
    const screen = await openBookings(page);

    await expect(screen.getByTestId("bar-place")).toHaveText("1 Owner Ave"); // the home address (#268)
    await expect(screen.getByTestId("bar-pets")).toContainText("2 pets");
    await expect(screen.getByTestId("bar-search")).toHaveCount(0); // nothing to press: it searches by itself
    // Chloe (a favorite) is under Favorites, Paul (not) under Sitters nearby, Uma is out of range.
    await expect(screen.getByTestId("sitter-favorites").getByTestId("sitter-tile-Chloe")).toBeVisible();
    await expect(screen.getByTestId("sitter-nearby").getByTestId("sitter-tile-Paul")).toBeVisible();
    await expect(screen.getByTestId("sitter-nearby").getByTestId("sitter-tile-Chloe")).toHaveCount(0);
    await expect(screen.getByTestId("sitter-tile-Uma")).toHaveCount(0);
    expect(db.nearbySearches.at(-1)).toMatchObject({ p_pet_count: 2, p_radius_km: 5, p_lat: null, p_lng: null });
    // The bar is one line: its three parts sit side by side.
    const place = await box(screen.getByTestId("bar-place"));
    const dates = await box(screen.getByTestId("bar-dates"));
    const pets = await box(screen.getByTestId("bar-pets"));
    expect(Math.abs(place.y - dates.y)).toBeLessThan(4);
    expect(Math.abs(dates.y - pets.y)).toBeLessThan(4);

    // One sitter per line, each with how far away; favorites first.
    const chloe = await box(screen.getByTestId("sitter-tile-Chloe"));
    const paul = await box(screen.getByTestId("sitter-tile-Paul"));
    expect(chloe.y).toBeLessThan(paul.y);
    await expect(screen.getByTestId("sitter-km-Chloe")).toHaveText("3 km");
    await expect(screen.getByTestId("sitter-km-Paul")).toHaveText("4 km");
  });

  test("a range on the calendar and exact times set the stay", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER, PAUL, UMA]);
    seed(db);
    const screen = await openBookings(page);
    await expect(screen.getByTestId("sitter-tile-Chloe")).toBeVisible();
    const calls = db.nearbySearches.length;

    await screen.getByTestId("bar-dates").click();
    // Near the end of a month the second day is on the next page of the calendar.
    await pickStayDay(screen, inDays(5));
    await pickStayDay(screen, inDays(8));
    await screen.getByTestId("search-drop_off-time-plus").click(); // 9:15 AM
    await screen.getByTestId("stay-done").click();
    await expect.poll(() => db.nearbySearches.length).toBeGreaterThan(calls);
    // Toronto is UTC-4 in summer time and UTC-5 after it ends (early November): 9:15 AM and 5:00 PM read either way.
    await expect.poll(() => String(db.nearbySearches.at(-1)?.p_drop_off_at)).toMatch(new RegExp(`${inDays(5)}T1[34]:15`));
    expect(String(db.nearbySearches.at(-1)?.p_pick_up_at)).toMatch(new RegExp(`${inDays(8)}T2[12]:00`));

    // The clock opens from the time itself.
    await screen.getByTestId("bar-dates").click();
    await screen.getByTestId("search-pick_up-time-value").click();
    await expect(screen.getByTestId("search-pick_up-clock")).toBeVisible();
  });

  test("the radius slider sits under the bar, goes 1 to 100 km in 1 km steps, and is remembered", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER, PAUL, UMA]);
    seed(db);
    db.owner_profiles[0].search_radius_km = 20;
    const screen = await openBookings(page);
    await expect(screen.getByTestId("sitter-tile-Chloe")).toBeVisible();
    expect(db.nearbySearches.at(-1)).toMatchObject({ p_radius_km: 20 });
    await expect(screen.getByTestId("radius-value")).toHaveText("20 km");

    // → is 1 km, Page Up is 10 km, and the list follows.
    await screen.getByTestId("radius-slider").focus();
    await page.keyboard.press("ArrowRight");
    await expect(screen.getByTestId("radius-value")).toHaveText("21 km");
    await page.keyboard.press("PageUp");
    await expect(screen.getByTestId("radius-value")).toHaveText("31 km");
    await expect.poll(() => db.owner_profiles[0].search_radius_km).toBe(31);
    // The list follows the slider a moment after the radius is saved (a slow CI run saw the old 20 km here).
    await expect.poll(() => db.nearbySearches.at(-1)).toMatchObject({ p_radius_km: 31 });
  });

  test("5 km sits at 1/20 of the slider and a click on the track moves in whole km", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER, PAUL, UMA]);
    seed(db);
    const screen = await openBookings(page);
    await expect(screen.getByTestId("radius-value")).toHaveText("5 km");
    const track = await box(screen.getByTestId("radius-slider"));
    const thumb = await box(screen.getByTestId("radius-slider-thumb"));
    const ratio = (thumb.x + thumb.width / 2 - track.x) / track.width;
    expect(ratio).toBeLessThan(0.12);
    await page.mouse.click(track.x + track.width - 4, track.y + track.height / 2);
    await expect(screen.getByTestId("radius-value")).toHaveText("100 km");
  });

  test("an address or a postal code sends that point; the postal area is the fallback", async ({ page }) => {
    const asked: unknown[] = [];
    await page.route("**/api/geo/geocode", async (route) => {
      const body = route.request().postDataJSON() as { address: string };
      asked.push(body.address);
      const found = body.address === "M5V";
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(found ? { found: true, lat: 43.6456, lng: -79.3929, label: "Toronto" } : { found: false, lat: null, lng: null, label: null }),
      });
    });
    const { db } = await mockSupabase(page, [OWNER, SITTER, PAUL, UMA]);
    seed(db);
    const screen = await openBookings(page);

    await screen.getByTestId("bar-place").click();
    await screen.getByTestId("place-input").fill("M5V 2T6");
    await screen.getByTestId("place-use-address").click();
    await expect(screen.getByTestId("bar-place")).toContainText("M5V 2T6");
    expect(asked).toEqual(["M5V 2T6", "M5V"]);
    await expect.poll(() => db.nearbySearches.at(-1)?.p_lat).toBe(43.6456);

    await screen.getByTestId("bar-place").click();
    await screen.getByTestId("place-input").fill("nowhere at all");
    await screen.getByTestId("place-use-address").click();
    await expect(screen.getByTestId("place-error")).toContainText("Couldn't find that place");
  });

  test("Current location asks the browser once and sends that point", async ({ page }) => {
    await stubGps(page);
    const { db } = await mockSupabase(page, [OWNER, SITTER, PAUL, UMA]);
    seed(db);
    const screen = await openBookings(page);

    await screen.getByTestId("bar-place").click();
    await screen.getByTestId("place-here").click();
    await expect(screen.getByTestId("bar-place")).toContainText("Current location");
    await expect.poll(() => db.nearbySearches.at(-1)?.p_lat).toBe(43.6477);
    expect(db.nearbySearches.at(-1)).toMatchObject({ p_lng: -79.4194 });
  });

  test("the bar names the place: the home address as typed, the full address of Current location (#268)", async ({ page }) => {
    await stubGps(page);
    const asked: unknown[] = [];
    await page.route("**/api/geo/reverse", (route) => {
      asked.push(route.request().postDataJSON());
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ found: true, label: "Trinity Bellwoods, Toronto", postal: "M6J", address: "Dundas St W, Toronto, M6J", full: "12 Dundas St W, Toronto, ON M6J 1G1" }),
      });
    });
    const { db } = await mockSupabase(page, [OWNER, SITTER, PAUL, UMA]);
    seed(db);
    Object.assign(db.owner_profiles.find((p) => p.id === OWNER.id)!, { home_address: "120 Harbord St, Toronto" });
    const screen = await openBookings(page);

    // My home: the address the owner typed on their Profile.
    await expect(screen.getByTestId("bar-place")).toHaveText("120 Harbord St");
    await screen.getByTestId("bar-place").click();
    await expect(screen.getByTestId("place-home")).toContainText("120 Harbord St, Toronto");

    // Current location: an exact lookup, the house number and street in the bar, the whole address in the sheet.
    await screen.getByTestId("place-here").click();
    await expect(screen.getByTestId("place-here")).toContainText("12 Dundas St W, Toronto, ON M6J 1G1");
    expect(asked.at(-1)).toMatchObject({ lat: 43.6477, lng: -79.4194, exact: true });
    await screen.getByTestId("place-done").click();
    await expect(screen.getByTestId("bar-place")).toHaveText("12 Dundas St W");
    await expect.poll(() => db.nearbySearches.at(-1)?.p_lat).toBe(43.6477);
  });

  test("a blocked location says how to fix it and keeps the home", async ({ page }) => {
    await stubGps(page, true);
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    seed(db);
    const screen = await openBookings(page);

    await screen.getByTestId("bar-place").click();
    await screen.getByTestId("place-here").click();
    await expect(screen.getByTestId("place-error")).toContainText("Location is blocked for this site");
    await screen.getByTestId("place-done").click();
    await expect(screen.getByTestId("bar-place")).toHaveText("1 Owner Ave");
  });

  test("the pets sheet picks who is staying", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER, PAUL, UMA]);
    seed(db);
    const screen = await openBookings(page);
    await expect(screen.getByTestId("sitter-tile-Chloe")).toBeVisible();

    await screen.getByTestId("bar-pets").click();
    await screen.getByTestId("search-pet-Mochi").click();
    await screen.getByTestId("pets-done").click();
    await expect(screen.getByTestId("bar-pets")).toContainText("Max");
    await expect.poll(() => db.nearbySearches.at(-1)?.p_pet_count).toBe(1);
  });

  test("no saved home: the tab says so and offers Profile", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    seed(db, { home: false });
    const screen = await openBookings(page);

    await expect(screen.getByTestId("search-problem")).toHaveText("Your home isn't on the map yet.");
    await expect(screen.getByTestId("search-open-profile")).toBeVisible();
  });

  test("nobody free: the list says so", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER, PAUL, UMA]);
    seed(db);
    db.nearby_sitters.splice(0, 2); // only Uma, 40 km away
    const screen = await openBookings(page);

    await expect(screen.getByTestId("search-none")).toHaveText("No sitters within 5 km for these dates.");
    await expect(screen.getByTestId("sitter-favorites")).toHaveCount(0);
  });

  test("with no favorites yet everyone nearby shows at once", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER, PAUL, UMA]);
    seed(db);
    db.owner_favorite_sitters.splice(0);
    const screen = await openBookings(page);

    await expect(screen.getByText("Sitters nearby")).toBeVisible();
    await expect(screen.getByTestId("sitter-tile-Chloe")).toBeVisible();
    await expect(screen.getByTestId("sitter-tile-Paul")).toBeVisible();
  });

  test("the avatar opens the sitter's photos (the profile when there are none), the name opens the profile, and there is no chat button", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER, PAUL, UMA]);
    seed(db);
    db.profile_photos.push({ id: "ph1", profile_id: SITTER.id, public_id: "goldito/chloe/1" });
    const screen = await openBookings(page);
    await expect(screen.getByTestId("sitter-tile-Chloe")).toBeVisible();
    await expect(screen.getByTestId("sitter-tile-Paul")).toBeVisible();
    await expect(screen.getByTestId("sitter-chat-Chloe")).toHaveCount(0);

    await screen.getByTestId("sitter-avatar-Chloe").click();
    await expect(screen.getByTestId("sitter-photos-photo-1")).toBeVisible();
    await screen.getByTestId("sitter-photos-close").click();
    await expect(page).toHaveURL(/\/owner\/bookings$/);

    // Paul has no photo: the avatar goes to his profile, like the name.
    await screen.getByTestId("sitter-avatar-Paul").click();
    await expect(page).toHaveURL(new RegExp(`/owner/sitters/${PAUL.id}\\?`));
  });

  test("a tile opens the sitter detail with the stay", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER, PAUL, UMA]);
    seed(db);
    const screen = await openBookings(page);
    await screen.getByTestId("bar-pets").click();
    await screen.getByTestId("search-pet-Mochi").click(); // only Max
    await screen.getByTestId("pets-done").click();
    await screen.getByTestId("sitter-tile-Chloe").click();

    await expect(page).toHaveURL(new RegExp(`/owner/sitters/${SITTER.id}\\?`));
    const q = new URL(page.url()).searchParams;
    expect(q.get("pets")).toBe(MAX);
    expect(q.get("drop")).toContain("T13:00");
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
