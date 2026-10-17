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

async function mockGeocode(page: Page, answer: object, status = 200) {
  const asked: unknown[] = [];
  await page.route("**/api/geo/geocode", async (route) => {
    asked.push(route.request().postDataJSON());
    return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(answer) });
  });
  return asked;
}

async function openProfile(page: Page, user: typeof OWNER | typeof SITTER, home: string) {
  await signIn(page, user);
  await expect(page).toHaveURL(new RegExp(`/${home}$`));
  await app(page).getByTestId("open-profile").click();
  await expect(page).toHaveURL(/\/profile$/);
}

test.describe("home map pin", () => {
  test("nothing reads the location until the button is tapped; one tap reads it once", async ({ page }) => {
    const gps = await stubGps(page);
    await mockSupabase(page, [OWNER]);
    await openProfile(page, OWNER, "owner");
    const screen = app(page);

    await expect(screen.getByTestId("profile-home-pin-status")).toContainText("No pin yet");
    expect(await gps.reads()).toBe(0);
    await screen.getByTestId("profile-use-location").click();
    await expect(screen.getByTestId("profile-home-pin-status")).toContainText("Pin set from your location");
    expect(await gps.reads()).toBe(1);
  });

  test("One tap reads the location once and Save keeps it as the pin", async ({ page }) => {
    const gps = await stubGps(page);
    const asked = await mockGeocode(page, { found: false });
    const { db } = await mockSupabase(page, [OWNER]);
    await openProfile(page, OWNER, "owner");
    const screen = app(page);

    await screen.getByTestId("profile-home_address").fill("5 Somewhere Ave, Toronto");
    await screen.getByTestId("profile-use-location").click();
    await expect(screen.getByTestId("profile-home-pin-status")).toContainText("Pin set from your location");
    await expect(screen.getByTestId("profile-home-pin-note")).toHaveCount(0);
    expect(await gps.reads()).toBe(1);

    await screen.getByTestId("profile-save").click();
    await expect(screen.getByTestId("toast")).toContainText("Profile saved");
    const row = db.owner_profiles.find((r) => r.id === OWNER.id);
    expect(row?.home_lat).toBe(43.6477);
    expect(row?.home_lng).toBe(-79.4194);
    expect(asked).toEqual([]); // a pin from the phone is not overwritten by a lookup of the typed address
  });

  test("a refused browser permission says so and leaves the pin as it was", async ({ page }) => {
    const gps = await stubGps(page, true);
    await mockSupabase(page, [OWNER]);
    await openProfile(page, OWNER, "owner");
    const screen = app(page);

    await screen.getByTestId("profile-use-location").click();
    await expect(screen.getByTestId("profile-home-pin-note")).toContainText("Location is off for Goldito");
    await expect(screen.getByTestId("profile-home-pin-status")).toContainText("No pin yet");
    expect(await gps.reads()).toBe(1);
  });

  test("a saved address is looked up, the pin is stored and one line says where it landed", async ({ page }) => {
    const asked = await mockGeocode(page, { found: true, lat: 43.6536, lng: -79.384, label: "Spadina—Fort York, Toronto" });
    const { db } = await mockSupabase(page, [OWNER]);
    await openProfile(page, OWNER, "owner");
    const screen = app(page);

    await screen.getByTestId("profile-home_address").fill("100 Queen St W, Toronto");
    await screen.getByTestId("profile-save").click();
    await expect(screen.getByTestId("toast")).toContainText("Pin placed near Spadina—Fort York, Toronto");
    expect(asked).toEqual([{ address: "100 Queen St W, Toronto" }]);
    const row = db.owner_profiles.find((r) => r.id === OWNER.id);
    expect(row?.home_address).toBe("100 Queen St W, Toronto");
    expect([row?.home_lat, row?.home_lng]).toEqual([43.6536, -79.384]);

    await screen.getByTestId("open-profile").click();
    await expect(screen.getByTestId("profile-home-pin-status")).toContainText("Pin saved");
  });

  test("an address that can't be placed clears the old pin and says so; the lookup being down reads the same", async ({ page }) => {
    await mockGeocode(page, { detail: "down" }, 502);
    const { db } = await mockSupabase(page, [OWNER]);
    db.owner_profiles.push({ id: OWNER.id, home_address: "1 Old St", home_lat: 43.1, home_lng: -79.1 });
    await openProfile(page, OWNER, "owner");
    const screen = app(page);

    await expect(screen.getByTestId("profile-home-pin-status")).toContainText("Pin saved");
    await screen.getByTestId("profile-home_address").fill("2 New St, Nowhere");
    await screen.getByTestId("profile-save").click();
    await expect(screen.getByTestId("toast")).toContainText("couldn't place that address");
    const row = db.owner_profiles.find((r) => r.id === OWNER.id);
    expect(row?.home_address).toBe("2 New St, Nowhere");
    expect(row?.home_lat).toBeNull();
  });

  test("saving without touching the address does not look it up and keeps the pin", async ({ page }) => {
    const asked = await mockGeocode(page, { found: false });
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

    await expect(screen.getByTestId("profile-home-pin-status")).toContainText("Pin saved");
    await screen.getByTestId("profile-service_area").fill("North York");
    await screen.getByTestId("profile-save").click();
    await expect(screen.getByTestId("toast")).toContainText("Profile saved");
    expect(asked).toEqual([]);
    const row = db.sitter_profiles.find((r) => r.id === SITTER.id);
    expect([row?.home_lat, row?.home_lng]).toEqual([43.6477, -79.4194]);
  });
});
