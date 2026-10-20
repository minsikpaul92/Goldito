import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { app, signIn } from "./helpers";
import { OWNER, SITTER, mockSupabase } from "./supabaseMock";

// The home map pin (phase-06b 6B.2): the location is read only after the app's own consent screen, and an address
// that is saved is looked up and the person sees one line about where it landed. The geocode endpoint is mocked
// (pytest covers the real one); the browser's GPS is a counting stub.

type Gps = { reads: () => Promise<number> };

/** Replaces navigator.geolocation in every frame with a stub that counts reads. `deny` answers "permission denied". */
async function stubGps(page: Page, deny = false): Promise<Gps> {
  await page.addInitScript((denied) => {
    const w = window as unknown as { __gpsReads: number };
    w.__gpsReads = 0;
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition(ok: (p: unknown) => void, fail: (e: unknown) => void) {
          w.__gpsReads++;
          if (denied) fail({ code: 1 });
          else ok({ coords: { latitude: 43.6477, longitude: -79.4194 } });
        },
        watchPosition: () => 1,
        clearWatch: () => undefined,
      },
    });
  }, deny);
  const frame = () => page.frames().find((f) => f !== page.mainFrame()) ?? page.mainFrame();
  return { reads: () => frame().evaluate(() => (window as unknown as { __gpsReads: number }).__gpsReads) };
}

/** "Check address": the real addresses the lookup finds, or a status >= 400 when it is down. */
async function mockSuggest(page: Page, results: { label: string; lat: number; lng: number }[], status = 200) {
  const asked: unknown[] = [];
  await page.route("**/api/geo/suggest", async (route) => {
    asked.push(route.request().postDataJSON());
    const body = status >= 400 ? { detail: "down" } : { results };
    return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  });
  return asked;
}

/** The reverse lookup ("where is this pin?"). `label: null` = nobody can name the spot; a status ≥ 400 = the lookup is down. */
async function mockReverse(
  page: Page,
  label: string | null,
  status = 200,
  postal: string | null = "M6J",
  address: string | null = "Dundas St W, Toronto, M6J",
) {
  const asked: unknown[] = [];
  await page.route("**/api/geo/reverse", async (route) => {
    asked.push(route.request().postDataJSON());
    const body = status >= 400 ? { detail: "down" } : { found: label !== null, label, postal, address };
    return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  });
  return asked;
}

async function openProfile(page: Page, user: typeof OWNER | typeof SITTER, home: string) {
  await signIn(page, user);
  await expect(page).toHaveURL(new RegExp(`/${home}$`));
  await app(page).getByTestId("open-menu").click();
  await app(page).getByTestId("open-profile").click();
  await expect(page).toHaveURL(/\/profile$/);
}

test.describe("home map pin", () => {
  test("nothing reads the location until the button is tapped; one tap reads it once", async ({ page }) => {
    const gps = await stubGps(page);
    await mockReverse(page, "Trinity Bellwoods, Toronto");
    await mockSupabase(page, [OWNER]);
    await openProfile(page, OWNER, "owner");
    const screen = app(page);

    // Before the tap only the button is there: no status, no place, no map link (an old pin would be noise).
    await expect(screen.getByTestId("profile-use-location")).toBeVisible();
    await expect(screen.getByTestId("profile-home-pin-status")).toHaveCount(0);
    await expect(screen.getByTestId("profile-home-pin-where")).toHaveCount(0);
    await expect(screen.getByTestId("profile-home-pin-map")).toHaveCount(0);
    await expect(screen.getByTestId("profile-home-pin-use")).toHaveCount(0);
    expect(await gps.reads()).toBe(0);
    await screen.getByTestId("profile-use-location").click();
    await expect(screen.getByTestId("profile-home-pin-status")).toContainText("Pin set from your location");
    // The change is easy to notice: a toast, a highlighted status and the button now offers to read again (#131).
    await expect(screen.getByTestId("toast")).toContainText("Location found");
    await expect(screen.getByTestId("profile-use-location")).toContainText("Read my location again");
    // The person sees where the pin landed, can check it on a map, and is told what it is for (#131).
    await expect(screen.getByTestId("profile-home-pin-where")).toHaveText("📍 Near Trinity Bellwoods, Toronto · M6J");
    await expect(screen.getByTestId("profile-home-pin-map")).toBeVisible();
    await expect(screen.getByTestId("profile-home-pin-use")).toContainText("finding sitters near you");
    expect(await gps.reads()).toBe(1);
  });

  test("One tap reads the location once and Save keeps it as the pin", async ({ page }) => {
    const gps = await stubGps(page);
    const asked = await mockSuggest(page, []);
    const reversed = await mockReverse(page, "Trinity Bellwoods, Toronto");
    const { db } = await mockSupabase(page, [OWNER]);
    await openProfile(page, OWNER, "owner");
    const screen = app(page);

    await screen.getByTestId("profile-home_address").fill("5 Somewhere Ave, Toronto");
    await screen.getByTestId("profile-use-location").click();
    await expect(screen.getByTestId("profile-home-pin-status")).toContainText("Pin set from your location");
    await expect(screen.getByTestId("profile-home-pin-note")).toHaveCount(0);
    expect(await gps.reads()).toBe(1);

    await expect(screen.getByTestId("profile-home-pin-where")).toHaveText("📍 Near Trinity Bellwoods, Toronto · M6J");
    // The location writes the home address too (street, city, postal area; the house number is the person's to add).
    await expect(screen.getByTestId("profile-home_address")).toHaveValue("Dundas St W, Toronto, M6J");
    await screen.getByTestId("profile-save").click();
    // The toast says where the pin was saved, not just that it was.
    await expect(screen.getByTestId("toast")).toContainText("Pin saved near Trinity Bellwoods, Toronto");
    const row = db.owner_profiles.find((r) => r.id === OWNER.id);
    expect(row?.home_lat).toBe(43.6477);
    expect(row?.home_lng).toBe(-79.4194);
    expect(row?.home_address).toBe("Dundas St W, Toronto, M6J");
    expect(asked).toEqual([]); // a pin from the phone needs no address check
    expect(reversed).toEqual([{ lat: 43.6477, lng: -79.4194 }]);
  });

  test("a refused browser permission says so and leaves the pin as it was", async ({ page }) => {
    const gps = await stubGps(page, true);
    await mockSupabase(page, [OWNER]);
    await openProfile(page, OWNER, "owner");
    const screen = app(page);

    await screen.getByTestId("profile-use-location").click();
    await expect(screen.getByTestId("profile-home-pin-note")).toContainText("Location is off for Goldito");
    await expect(screen.getByTestId("profile-home-pin-status")).toHaveCount(0);
    expect(await gps.reads()).toBe(1);
  });

  test("Check address lists real addresses; the one picked is saved with its pin", async ({ page }) => {
    const asked = await mockSuggest(page, [
      { label: "100 Queen St W, Toronto, ON M5H 2N2", lat: 43.6536, lng: -79.384 },
      { label: "100 Queen St W, Hamilton, ON L8P 4S9", lat: 43.25, lng: -79.87 },
    ]);
    const { db } = await mockSupabase(page, [OWNER]);
    await openProfile(page, OWNER, "owner");
    const screen = app(page);

    await screen.getByTestId("profile-home_address").fill("100 Queen St W");
    await screen.getByTestId("profile-home_address-check-address").click();
    await expect(screen.getByTestId("profile-home_address-suggestions")).toContainText("Toronto");
    expect(asked).toEqual([{ address: "100 Queen St W" }]);
    await screen.getByTestId("profile-home_address-suggestion-1").click();
    await expect(screen.getByTestId("profile-home_address-address-ok")).toBeVisible();
    await expect(screen.getByTestId("profile-home_address")).toHaveValue("100 Queen St W, Toronto, ON M5H 2N2");
    await screen.getByTestId("profile-save").click();
    await expect(screen.getByTestId("toast")).toContainText("Profile saved");
    const row = db.owner_profiles.find((r) => r.id === OWNER.id);
    expect(row?.home_address).toBe("100 Queen St W, Toronto, ON M5H 2N2");
    expect([row?.home_lat, row?.home_lng]).toEqual([43.6536, -79.384]);
  });

  test("a sitter's checked address also gives the rough place owners see (city and postal area)", async ({ page }) => {
    await mockSuggest(page, [{ label: "2 Bloor St W, Toronto, ON M4W 3E2", lat: 43.6709, lng: -79.3866 }]);
    const { db } = await mockSupabase(page, [SITTER]);
    db.sitter_profiles.push({ id: SITTER.id, bio: null, service_area: null, experience_years: null, home_notes: null, home_address: null, services: ["boarding"] });
    await openProfile(page, SITTER, "sitter");
    const screen = app(page);
    await screen.getByTestId("profile-home_address").fill("2 Bloor St W");
    await screen.getByTestId("profile-home_address-check-address").click();
    await screen.getByTestId("profile-home_address-suggestion-1").click();
    await screen.getByTestId("profile-save").click();
    await expect(screen.getByTestId("toast")).toContainText("Profile saved");
    expect(db.sitter_profiles.find((r) => r.id === SITTER.id)?.service_area).toBe("Toronto M4W");
  });

  test("the address is required and has to be checked: empty, unchecked and edited-after-check are all refused", async ({ page }) => {
    await mockSuggest(page, [{ label: "100 Queen St W, Toronto, ON M5H 2N2", lat: 43.6536, lng: -79.384 }]);
    const { db } = await mockSupabase(page, [OWNER]);
    await openProfile(page, OWNER, "owner");
    const screen = app(page);

    await screen.getByTestId("profile-save").click();
    await expect(screen.getByText("Add your home address.")).toBeVisible();

    await screen.getByTestId("profile-home_address").fill("100 Queen St W");
    await screen.getByTestId("profile-save").click();
    await expect(screen.getByText("Check your address so it's on the map.")).toBeVisible();

    await screen.getByTestId("profile-home_address-check-address").click();
    await screen.getByTestId("profile-home_address-suggestion-1").click();
    await screen.getByTestId("profile-home_address").fill("100 Queen St W, Toronto, ON M5H 2N2 apt 4");
    await expect(screen.getByTestId("profile-home_address-address-ok")).toHaveCount(0); // edited: it has to be checked again
    await screen.getByTestId("profile-save").click();
    await expect(screen.getByText("Check your address so it's on the map.")).toBeVisible();
    expect(db.owner_profiles.find((r) => r.id === OWNER.id)?.home_address ?? null).toBeNull();
  });

  test("an address nobody knows says so; the check being down reads the same and nothing is saved", async ({ page }) => {
    await mockSuggest(page, [], 200);
    const { db } = await mockSupabase(page, [OWNER]);
    db.owner_profiles.push({ id: OWNER.id, home_address: "1 Old St", home_lat: 43.1, home_lng: -79.1 });
    await openProfile(page, OWNER, "owner");
    const screen = app(page);

    await expect(screen.getByTestId("profile-home_address-address-ok")).toBeVisible(); // a saved, placed address
    await screen.getByTestId("profile-home_address").fill("2 New St, Nowhere");
    await screen.getByTestId("profile-home_address-check-address").click();
    await expect(screen.getByTestId("profile-home_address-check-note")).toContainText("couldn't find that address");
    await screen.getByTestId("profile-save").click();
    await expect(screen.getByText("Check your address so it's on the map.")).toBeVisible();
    const row = db.owner_profiles.find((r) => r.id === OWNER.id);
    expect(row?.home_address).toBe("1 Old St"); // the old pin and address stay
    expect(row?.home_lat).toBe(43.1);
  });

  test("the address check being down says so", async ({ page }) => {
    await mockSuggest(page, [], 502);
    await mockSupabase(page, [OWNER]);
    await openProfile(page, OWNER, "owner");
    const screen = app(page);
    await screen.getByTestId("profile-home_address").fill("2 New St");
    await screen.getByTestId("profile-home_address-check-address").click();
    await expect(screen.getByTestId("profile-home_address-check-note")).toContainText("address check is down");
  });

  test("saving without touching the address does not look it up and keeps the pin", async ({ page }) => {
    const asked = await mockSuggest(page, []);
    const { db } = await mockSupabase(page, [SITTER]);
    db.sitter_profiles.push({
      id: SITTER.id,
      bio: null,
      service_area: null,
      experience_years: null,
      home_notes: null,
      home_address: "12 Maple St",
      home_lat: 43.6477,
      home_lng: -79.4194,
    });
    await openProfile(page, SITTER, "sitter");
    const screen = app(page);

    await expect(screen.getByTestId("profile-home-pin-status")).toHaveCount(0);
    await screen.getByTestId("profile-service_area").fill("North York");
    await screen.getByTestId("profile-save").click();
    await expect(screen.getByTestId("toast")).toContainText("Profile saved");
    expect(asked).toEqual([]);
    const row = db.sitter_profiles.find((r) => r.id === SITTER.id);
    expect([row?.home_lat, row?.home_lng]).toEqual([43.6477, -79.4194]);
  });
  test("a pin the map can't name says so, and a sitter is told what the pin is for", async ({ page }) => {
    await stubGps(page);
    await mockReverse(page, null, 502);
    const { db } = await mockSupabase(page, [SITTER]);
    db.sitter_profiles.push({ id: SITTER.id, home_lat: 43.1, home_lng: -79.1, services: ["boarding"] });
    await openProfile(page, SITTER, "sitter");
    const screen = app(page);

    await expect(screen.getByTestId("profile-home-pin-where")).toHaveCount(0);
    await screen.getByTestId("profile-use-location").click();
    await expect(screen.getByTestId("profile-home-pin-where")).toContainText("couldn't name this spot");
    await expect(screen.getByTestId("profile-home-pin-use")).toContainText("Owners only see a rounded distance");
    await expect(screen.getByTestId("profile-home-pin-map")).toBeVisible();
  });
});
