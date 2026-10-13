import { expect as baseExpect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { app, box, center, drag, scrollOffset, signIn as rawSignIn } from "./helpers";
import { MockDb, OWNER, SITTER, mockSupabase } from "./supabaseMock";

// These screens load their trips through a poll as well as Realtime, so under a loaded CI machine they need a little
// longer than the default 5 s to show up.
const expect = baseExpect.configure({ timeout: 10_000 });

/** Signs in and waits for Home: going to another page before the session is stored loses the login. */
async function signIn(page: Page, user: typeof OWNER | typeof SITTER) {
  await rawSignIn(page, user);
  await baseExpect(page).toHaveURL(new RegExp(`/${user.role}$`), { timeout: 15_000 });
}

// Pet Transit screens (phase-06b 6B.3 · 6B.4): Start trip behind the consent screen, a simulated drive that fills the
// map and the ETA, the arrival cards, and the other person following along. Realtime is not mocked in e2e, so the
// screens update through their short poll — which is also what covers a dropped socket for real.

const BOOKING = "00000000-0000-4000-8000-0000000000e1";
const MAX = "00000000-0000-4000-8000-0000000000c1";
const HOUR = 3_600_000;
const CHLOE_HOME = { lat: 43.6477, lng: -79.4194 };
const ROBERT_HOME = { lat: 43.6644, lng: -79.3573 };
// A 1×1 transparent PNG for the map tiles, so the tests never reach the internet.
const TILE = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");

function setProfile(rows: Record<string, unknown>[], id: string, patch: Record<string, unknown>) {
  const row = rows.find((r) => r.id === id);
  if (row) Object.assign(row, patch);
  else rows.push({ id, ...patch });
}

/** A paid, confirmed stay whose drop-off is `dropInMs` away, at `place`; both homes have a map point. */
function seed(db: MockDb, place: "sitter_home" | "owner_home" | "other", dropInMs = 30 * 60_000) {
  db.pets.push({ id: MAX, owner_id: OWNER.id, species: "dog", name: "Max", breed: null, notes: null });
  db.bookings.push({
    id: BOOKING,
    owner_id: OWNER.id,
    sitter_id: SITTER.id,
    status: "confirmed",
    service_type: "boarding",
    meet_greet_status: "done",
    created_at: "2026-10-02T18:00:00Z",
    paid_at: "2026-10-03T18:00:00Z",
  });
  db.booking_pets.push({ booking_id: BOOKING, pet_id: MAX });
  const now = Date.now();
  for (const [kind, at] of [
    ["drop_off", now + dropInMs],
    ["pick_up", now + dropInMs + 72 * HOUR],
  ] as const) {
    db.booking_handoffs.push({
      id: `h-${kind}`,
      booking_id: BOOKING,
      kind,
      scheduled_at: new Date(at).toISOString(),
      location_type: place,
      location_note: place === "other" ? "Riverside Park gate" : null,
      within_sitter_hours: true,
      status: "agreed",
      proposed_by: OWNER.id,
      completed_at: null,
      created_at: "2026-10-02T18:00:00Z",
    });
  }
  setProfile(db.sitter_profiles, SITTER.id, {
    home_address: "12 Maple St",
    home_lat: CHLOE_HOME.lat,
    home_lng: CHLOE_HOME.lng,
    visitor_parking: "Spot B-12 behind the building",
    lobby_notes: "Buzz #1204",
  });
  setProfile(db.owner_profiles, OWNER.id, {
    home_address: "9 Oak Ave",
    home_lat: ROBERT_HOME.lat,
    home_lng: ROBERT_HOME.lng,
  });
}

async function stubTiles(page: Page) {
  await page.route("**/tile.openstreetmap.org/**", (route) => route.fulfill({ status: 200, contentType: "image/png", body: TILE }));
}

/** Opening Google Maps opens a new tab; the test answers it locally and returns the URL it was sent to. */
async function mapsUrlAfter(page: Page, click: () => Promise<void>): Promise<URL> {
  await page.context().route("https://www.google.com/**", (route) => route.fulfill({ status: 200, contentType: "text/html", body: "maps" }));
  const [tab] = await Promise.all([page.context().waitForEvent("page"), click()]);
  const url = new URL(tab.url() === "about:blank" ? await tab.waitForURL(/google\.com/).then(() => tab.url()) : tab.url());
  await tab.close();
  return url;
}

const runningTrip = (patch: Record<string, unknown> = {}) => ({
  id: "trip-1",
  booking_id: BOOKING,
  handoff_kind: "drop_off",
  traveler_id: OWNER.id,
  status: "en_route",
  dest_lat: CHLOE_HOME.lat,
  dest_lng: CHLOE_HOME.lng,
  last_lat: 43.6566,
  last_lng: -79.3911,
  last_at: new Date().toISOString(),
  eta_at: new Date(Date.now() + 12 * 60_000).toISOString(),
  distance_m: 5200,
  simulated: false,
  sharing: true,
  started_at: new Date().toISOString(),
  arrived_at: null,
  ended_at: null,
  ...patch,
});

test.describe("pet transit", () => {
  test("the owner starts a simulated drive behind the consent screen; the map and ETA fill in; Chloe's place opens on arrival", async ({ page }) => {
    test.setTimeout(100_000);
    await stubTiles(page);
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    seed(db, "sitter_home");
    await signIn(page, OWNER);
    await expect(page).toHaveURL(/\/owner$/);
    await page.goto(`/owner/bookings/${BOOKING}`);
    const screen = app(page);

    await screen.getByTestId("trip-start").click();
    await expect(screen.getByTestId("share-trip-sheet")).toContainText("Share your live location with Chloe");
    expect(db.trips).toHaveLength(0); // nothing starts until Allow / Simulate

    await screen.getByTestId("share-trip-sheet-simulate").click();
    await expect(page).toHaveURL(/\/trip$/);
    expect(db.trips).toHaveLength(1);
    expect(db.trips[0]).toMatchObject({ traveler_id: OWNER.id, simulated: true, handoff_kind: "drop_off" });
    await expect(screen.getByTestId("trip-sharing-banner")).toContainText("Sharing your location with Chloe until you arrive");
    await expect(screen.getByTestId("trip-eta")).toContainText("ETA");
    await expect(screen.getByTestId("trip-map")).toBeVisible();
    await expect(screen.getByText("© OpenStreetMap contributors")).toBeVisible();

    await expect(screen.getByTestId("trip-eta")).toContainText("You've arrived", { timeout: 70_000 });
    expect(db.trips[0].status).toBe("arrived");
    const place = screen.getByTestId("trip-place-card");
    await expect(place).toContainText("Chloe's place");
    await expect(place).toContainText("12 Maple St");
    await expect(place).toContainText("Spot B-12 behind the building");
    await expect(place).toContainText("Buzz #1204");
    await expect(screen.getByTestId("trip-sharing-banner")).toHaveCount(0); // arrived: sharing is over
  });

  test("Cancel on the consent screen keeps the trip unstarted", async ({ page }) => {
    await mockSupabase(page, [OWNER, SITTER]).then(({ db }) => seed(db, "sitter_home"));
    await signIn(page, OWNER);
    await page.goto(`/owner/bookings/${BOOKING}`);
    const screen = app(page);

    await screen.getByTestId("trip-start").click();
    await screen.getByTestId("share-trip-sheet-decline").click();
    await expect(screen.getByTestId("share-trip-sheet")).toHaveCount(0);
    await expect(screen.getByTestId("trip-start")).toBeVisible();
    await expect(page).toHaveURL(/\/owner\/bookings\//);
  });

  test("the person who does not travel has no Start trip, and it waits for the 2-hour window", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    seed(db, "sitter_home", 5 * HOUR);
    await signIn(page, SITTER);
    await page.goto(`/sitter/bookings/${BOOKING}`);
    await expect(app(page).getByTestId("handoff-check")).toBeVisible();
    await expect(app(page).getByTestId("trip-start")).toHaveCount(0); // the owner drives to the sitter's home
    await expect(app(page).getByTestId("trip-entry-waiting")).toHaveCount(0);
  });

  test("an owner before the window sees when Start trip opens", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    seed(db, "sitter_home", 5 * HOUR);
    await signIn(page, OWNER);
    await page.goto(`/owner/bookings/${BOOKING}`);
    await expect(app(page).getByTestId("trip-entry-waiting")).toContainText("You can start the trip from");
    await expect(app(page).getByTestId("trip-start")).toHaveCount(0);
  });

  test("the sitter follows the owner's trip from Home, then sees the arrival without a refresh", async ({ page }) => {
    await stubTiles(page);
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    seed(db, "sitter_home");
    db.trips.push(runningTrip());
    await signIn(page, SITTER);
    const screen = app(page);

    await expect(screen.getByTestId("active-trip-card")).toContainText("Robert is on the way");
    await screen.getByTestId("active-trip-card").click();
    await expect(page).toHaveURL(/\/sitter\/bookings\/.*\/trip$/);
    await expect(screen.getByTestId("trip-eta")).toContainText("5.2 km");
    await expect(screen.getByTestId("trip-map")).toBeVisible();
    await expect(screen.getByTestId("trip-sharing-banner")).toHaveCount(0); // not my location
    await expect(screen.getByTestId("trip-cancel")).toHaveCount(0);

    Object.assign(db.trips[0], { status: "arrived", arrived_at: new Date().toISOString(), distance_m: 60, last_lat: 43.6481, last_lng: -79.4194 });
    await expect(screen.getByTestId("trip-eta")).toContainText("Robert has arrived", { timeout: 12_000 });
    await expect(screen.getByTestId("trip-arrived-card")).toContainText("Robert has arrived");
  });

  test("with no trip running, Home reads trips slowly — not every 4 seconds (CR-9)", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    seed(db, "sitter_home");
    await signIn(page, SITTER);
    await expect(app(page).getByRole("heading", { name: "Home" })).toBeVisible();
    let reads = 0;
    page.on("request", (r) => {
      if (r.url().includes("/rest/v1/trips")) reads += 1;
    });
    await page.waitForTimeout(9_000);
    expect(reads).toBeLessThanOrEqual(1);
  });

  test("a trip that ends takes its card off Home", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    seed(db, "sitter_home");
    db.trips.push(runningTrip());
    await signIn(page, SITTER);
    await expect(app(page).getByTestId("active-trip-card")).toBeVisible();
    Object.assign(db.trips[0], { status: "completed", last_lat: null, last_lng: null, eta_at: null, distance_m: null });
    await expect(app(page).getByTestId("active-trip-card")).toHaveCount(0, { timeout: 12_000 });
  });

  test("Received ends the trip that is still running, and the cards go away", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    seed(db, "sitter_home");
    db.trips.push(runningTrip({ status: "arrived", arrived_at: new Date().toISOString(), distance_m: 60 }));
    await signIn(page, SITTER);
    await page.goto(`/sitter/bookings/${BOOKING}`);
    const screen = app(page);

    await expect(screen.getByTestId("trip-entry-live")).toContainText("Robert has arrived");
    await screen.getByTestId("handoff-received").click();
    await expect(screen.getByTestId("toast")).toContainText("checked in");
    expect(db.completions).toEqual([{ p_booking: BOOKING, p_kind: "drop_off" }]);
    expect(db.trips[0]).toMatchObject({ status: "completed", last_lat: null, eta_at: null });
    await expect(screen.getByTestId("trip-entry-live")).toHaveCount(0, { timeout: 12_000 });
  });

  test("the sitter drives to the owner's home: the entry info card opens on arrival", async ({ page }) => {
    test.setTimeout(100_000);
    await stubTiles(page);
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    seed(db, "owner_home");
    db.owner_home_access.push({ owner_id: OWNER.id, entry_steps: "Side door", lockbox_code: "4821", buzzer: "1204" });
    await signIn(page, SITTER);
    await page.goto(`/sitter/bookings/${BOOKING}`);
    const screen = app(page);

    await screen.getByTestId("trip-start").click();
    await screen.getByTestId("share-trip-sheet-simulate").click();
    await expect(page).toHaveURL(/\/sitter\/bookings\/.*\/trip$/);
    await expect(screen.getByTestId("trip-sharing-banner")).toContainText("Sharing your location with Robert");
    expect(db.trips[0]).toMatchObject({ traveler_id: SITTER.id, dest_lat: ROBERT_HOME.lat });

    await expect(screen.getByTestId("trip-eta")).toContainText("You've arrived", { timeout: 70_000 });
    // The booking page stays in the stack under the Trip screen, so its own card is in the DOM too: look inside the trip.
    await expect(screen.getByTestId("trip-screen").getByTestId("entry-info-open")).toBeVisible();
    await expect(screen.getByTestId("trip-place-card")).toHaveCount(0);
  });

  test("Cancel trip ends it and takes the position away", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    seed(db, "sitter_home");
    db.trips.push(runningTrip());
    await stubTiles(page);
    await signIn(page, OWNER);
    await page.goto(`/owner/bookings/${BOOKING}/trip`);
    const screen = app(page);

    await expect(screen.getByTestId("trip-sharing-banner")).toContainText("This device isn't sharing");
    await screen.getByTestId("trip-cancel").click();
    await expect(screen.getByTestId("trip-none")).toBeVisible();
    expect(db.trips[0]).toMatchObject({ status: "cancelled", last_lat: null, last_lng: null, eta_at: null });
  });

  test("Start without sharing: the trip exists, the other person sees the meeting place — and both can open Google Maps", async ({ browser }) => {
    const ctxOwner = await browser.newContext();
    const owner = await ctxOwner.newPage();
    const { db } = await mockSupabase(owner, [OWNER, SITTER]);
    seed(db, "sitter_home");
    await signIn(owner, OWNER);
    await owner.goto(`/owner/bookings/${BOOKING}`);
    const screen = app(owner);

    // Before the trip even starts, the owner can already open the place in Google Maps (directions: they will travel).
    const early = await mapsUrlAfter(owner, () => screen.getByTestId("trip-entry-maps").click());
    expect(early.pathname).toBe("/maps/dir/");
    expect(early.searchParams.get("destination")).toBe("12 Maple St");
    expect(early.searchParams.get("travelmode")).toBe("driving");

    await screen.getByTestId("trip-start").click();
    await screen.getByTestId("share-trip-sheet-alternative").click();
    await expect(owner).toHaveURL(/\/trip$/);
    expect(db.trips).toHaveLength(1);
    expect(db.trips[0]).toMatchObject({ sharing: false, last_lat: null, eta_at: null, traveler_id: OWNER.id });
    await expect(screen.getByTestId("trip-not-sharing-banner")).toContainText("You're not sharing your location — Chloe sees the meeting place");
    await expect(screen.getByTestId("trip-map")).toHaveCount(0);
    await expect(screen.getByTestId("trip-meeting-place")).toContainText("Chloe's place");
    await expect(screen.getByTestId("trip-meeting-place")).toContainText("12 Maple St");
    const mine = await mapsUrlAfter(owner, () => screen.getByTestId("trip-maps").click());
    expect(mine.pathname).toBe("/maps/dir/"); // the traveller gets directions
    await ctxOwner.close();
  });

  test("the person waiting sees \"isn't sharing a live location\", the meeting place and an Open in Google Maps button", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    seed(db, "sitter_home");
    db.trips.push(runningTrip({ sharing: false, last_lat: null, last_lng: null, last_at: null, eta_at: null, distance_m: null }));
    await signIn(page, SITTER);
    await page.goto(`/sitter/bookings/${BOOKING}/trip`);
    const screen = app(page);

    await expect(screen.getByTestId("trip-eta")).toHaveText("Robert is on the way");
    await expect(screen.getByTestId("trip-substatus")).toHaveText("Robert isn't sharing a live location");
    await expect(screen.getByTestId("trip-map")).toHaveCount(0);
    await expect(screen.getByTestId("trip-meeting-place")).toContainText("Chloe's place");
    await expect(screen.getByTestId("trip-meeting-place")).toContainText("12 Maple St");
    await expect(screen.getByTestId("trip-meeting-place")).not.toContainText("Buzz"); // no entry codes in this card
    const url = await mapsUrlAfter(page, () => screen.getByTestId("trip-maps").click());
    expect(url.pathname).toBe("/maps/search/"); // the host sees the place itself, not directions
    expect(url.searchParams.get("query")).toBe("12 Maple St");
    expect(url.toString()).not.toContain("43.64"); // the address text is used, not the saved point
  });

  test("a live trip has the Google Maps button for both people too", async ({ page }) => {
    await stubTiles(page);
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    seed(db, "sitter_home");
    db.trips.push(runningTrip());
    await signIn(page, SITTER);
    await page.goto(`/sitter/bookings/${BOOKING}/trip`);
    await expect(app(page).getByTestId("trip-map")).toBeVisible();
    const url = await mapsUrlAfter(page, () => app(page).getByTestId("trip-maps").click());
    expect(url.pathname).toBe("/maps/search/");
  });

  test("a place with no written address falls back to the saved point", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    seed(db, "sitter_home");
    setProfile(db.sitter_profiles, SITTER.id, { home_address: null });
    db.trips.push(runningTrip({ sharing: false, last_lat: null, last_lng: null, eta_at: null }));
    await signIn(page, OWNER);
    await page.goto(`/owner/bookings/${BOOKING}/trip`);
    const url = await mapsUrlAfter(page, () => app(page).getByTestId("trip-maps").click());
    expect(url.searchParams.get("destination")).toBe(`${CHLOE_HOME.lat},${CHLOE_HOME.lng}`);
  });

  test("the browser saying no after Allow starts the trip without sharing, and says so", async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "geolocation", {
        configurable: true,
        value: { getCurrentPosition: (_ok: unknown, fail: (e: unknown) => void) => fail({ code: 1 }), watchPosition: () => 1, clearWatch: () => undefined },
      });
    });
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    seed(db, "sitter_home");
    await signIn(page, OWNER);
    await page.goto(`/owner/bookings/${BOOKING}`);
    const screen = app(page);

    await screen.getByTestId("trip-start").click();
    await screen.getByTestId("share-trip-sheet-allow").click();
    await expect(page).toHaveURL(/\/trip$/);
    await expect(screen.getByTestId("toast")).toContainText("Location is off in this browser, so Chloe sees the meeting place instead");
    expect(db.trips[0]).toMatchObject({ sharing: false, last_lat: null });
    await expect(screen.getByTestId("trip-not-sharing-banner")).toBeVisible();
  });

  test("a position that is a few minutes old says so, and why", async ({ page }) => {
    await stubTiles(page);
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    seed(db, "sitter_home");
    db.trips.push(runningTrip({ last_at: new Date(Date.now() - 3 * 60_000).toISOString() }));
    await signIn(page, SITTER);
    await page.goto(`/sitter/bookings/${BOOKING}/trip`);
    await expect(app(page).getByTestId("trip-last-seen")).toContainText("Last location 3 min ago");
  });

  test("two people at once: the sitter's drive shows up live for the owner, ends in an arrival, and Received closes it", async ({ browser }) => {
    test.setTimeout(150_000);
    // One shared database, two browsers: what the sitter does is what the owner's screen reads next.
    const sitterCtx = await browser.newContext();
    const ownerCtx = await browser.newContext();
    const sitterPage = await sitterCtx.newPage();
    const ownerPage = await ownerCtx.newPage();
    await stubTiles(sitterPage);
    await stubTiles(ownerPage);
    const { db } = await mockSupabase(sitterPage, [OWNER, SITTER]);
    await mockSupabase(ownerPage, [OWNER, SITTER], { db });
    seed(db, "owner_home"); // the sitter drives to the owner's home
    db.owner_home_access.push({ owner_id: OWNER.id, entry_steps: "Side door", lockbox_code: "4821", buzzer: "1204" });
    const sitter = app(sitterPage);
    const owner = app(ownerPage);

    await signIn(ownerPage, OWNER);
    await expect(owner.getByTestId("active-trip-card")).toHaveCount(0); // nothing is running yet

    await signIn(sitterPage, SITTER);
    await sitterPage.goto(`/sitter/bookings/${BOOKING}`);
    await sitter.getByTestId("trip-start").click();
    await sitter.getByTestId("share-trip-sheet-simulate").click();
    await expect(sitterPage).toHaveURL(/\/trip$/);

    // The owner's Home picks the trip up without a refresh, and the Trip screen follows the drive.
    await expect(owner.getByTestId("active-trip-card")).toContainText("Chloe is on the way", { timeout: 20_000 });
    await owner.getByTestId("active-trip-card").click();
    await expect(ownerPage).toHaveURL(/\/owner\/bookings\/.*\/trip$/);
    await expect(owner.getByTestId("trip-map")).toBeVisible();
    await expect(owner.getByTestId("trip-sharing-banner")).toHaveCount(0); // it is Chloe's location, not mine
    const first = await owner.getByTestId("trip-eta").innerText();
    await expect.poll(() => owner.getByTestId("trip-eta").innerText(), { timeout: 30_000 }).not.toBe(first); // the distance shrinks

    await expect(owner.getByTestId("trip-eta")).toContainText("Chloe has arrived", { timeout: 70_000 });
    await expect(owner.getByTestId("trip-arrived-card")).toBeVisible();
    await expect(sitter.getByTestId("trip-screen").getByTestId("entry-info-open")).toBeVisible();

    // Received on the sitter's booking page: the trip ends for both.
    await sitter.getByTestId("trip-open-booking").click();
    await sitter.getByTestId("handoff-received").click();
    await expect(sitter.getByTestId("toast")).toContainText("checked in");
    await expect(owner.getByTestId("trip-none")).toBeVisible({ timeout: 20_000 });
    expect(db.trips[0]).toMatchObject({ status: "completed", last_lat: null, eta_at: null });
    await owner.getByTestId("trip-open-booking").click();
    await expect(owner.getByTestId("handoff-drop_off")).toContainText("Received");

    await sitterCtx.close();
    await ownerCtx.close();
  });

  test("the map is view only: dragging over it scrolls the screen, and ± are buttons", async ({ page }) => {
    await stubTiles(page);
    await page.goto("/dev/gestures");
    const screen = app(page);
    const scroller = screen.getByTestId("lab-scroll");
    const map = screen.getByTestId("lab-map");
    await map.scrollIntoViewIfNeeded();
    await expect(screen.locator(".leaflet-container")).toBeVisible();
    const pane = screen.locator(".leaflet-map-pane");
    const before = await pane.evaluate((el) => (el as HTMLElement).style.transform);
    const startScroll = await scrollOffset(scroller);

    const middle = center(await box(map));
    await drag(page, middle, { x: middle.x, y: middle.y - 150 });
    expect(await scrollOffset(scroller)).toBeGreaterThan(startScroll);
    expect(await pane.evaluate((el) => (el as HTMLElement).style.transform)).toBe(before); // the map did not pan

    const zoomBefore = await screen.locator(".leaflet-zoom-animated").first().evaluate((el) => (el as HTMLElement).style.transform);
    await screen.getByTestId("lab-map-zoom-in").click();
    await expect.poll(() => screen.locator(".leaflet-zoom-animated").first().evaluate((el) => (el as HTMLElement).style.transform)).not.toBe(zoomBefore);
  });
});
