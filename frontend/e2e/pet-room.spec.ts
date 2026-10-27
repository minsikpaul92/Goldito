import { expect, test } from "@playwright/test";

import { HOUR } from "./careFixtures";
import { NOON_TORONTO, app, box, center, drag, signIn } from "./helpers";
import { fakePetPhoto } from "./pixelHooks";
import { OWNER, mockSupabase, type MockDb } from "./supabaseMock";

// The pet room on owner Home (11.12, #184): a swipe pager (Today / Pet), the 8-bit pet and its HUD, its shape and size
// from the breed and weight, and colors from a photo (PS.3, MediaPipe replaced by test hooks).

const pet = (id: string, name: string, species: "dog" | "cat", extra: object = {}) => ({
  id,
  owner_id: OWNER.id,
  species,
  name,
  breed: null,
  birthdate: null,
  weight_kg: null,
  notes: null,
  created_at: "2026-10-01T09:00:00Z",
  ...extra,
});

const checkin = (petId: string, kind: string, value: string | null, hoursAgo: number) => ({
  id: `ci-${petId}-${kind}-${hoursAgo}`,
  pet_id: petId,
  created_by: null,
  kind,
  value,
  note_text: null,
  media_id: null,
  created_at: new Date(NOON_TORONTO.getTime() - hoursAgo * HOUR).toISOString(),
});

async function setup(page: import("@playwright/test").Page, seed: (db: MockDb) => void) {
  // A running clock that starts at noon: the page animation needs time to move.
  await page.clock.install({ time: NOON_TORONTO });
  await page.clock.resume();
  const { db } = await mockSupabase(page, [OWNER], { now: NOON_TORONTO });
  seed(db);
  await signIn(page, OWNER);
  await app(page).getByTestId("home-pager").waitFor();
  return db;
}

test.describe("pet room", () => {
  test("Home is a pager: the pet page is not built until it is shown", async ({ page }) => {
    await setup(page, (db) => db.pets.push(pet("pet-max", "Max", "dog", { profile: { coat: "cream" } })));
    const screen = app(page);
    await expect(screen.getByTestId("pet-card-Max")).toBeVisible();
    await expect(screen.getByTestId("pet-room-Max")).toHaveCount(0);

    await screen.getByTestId("home-pager-tab-1").click();
    await expect(screen.getByTestId("pet-room-Max")).toBeVisible();
    await expect(screen.getByTestId("pet-room-Max-sprite")).toBeVisible();
    // Nothing logged today: calm, no HUD.
    await expect(screen.getByTestId("pet-room-Max-mood")).toHaveText("Calm");
    await expect(screen.getByTestId("pet-room-Max")).toContainText("No updates on Max yet today.");
    await screen.getByTestId("home-pager-tab-0").click();
    await expect(screen.getByTestId("pet-card-Max")).toBeVisible();
  });

  test("today's check-ins set the mood, the sentence and the pet's tiles", async ({ page }) => {
    await setup(page, (db) => {
      db.pets.push(pet("pet-max", "Max", "dog"));
      db.care_checkins.push(
        checkin("pet-max", "meal", "all", 2),
        checkin("pet-max", "mood", "happy", 1),
        checkin("pet-max", "walk", "30", 3),
        checkin("pet-max", "potty", "normal", 3),
      );
    });
    const screen = app(page);
    await screen.getByTestId("home-pager-tab-1").click();
    const room = screen.getByTestId("pet-room-Max");
    await expect(screen.getByTestId("pet-room-Max-mood")).toHaveText("Happy");
    await expect(room).toContainText("Max is in a playful mood.");
    await expect(screen.getByTestId("stat-tile-meal")).toContainText("Fed");
    await expect(screen.getByTestId("stat-tile-potty")).toContainText("Done");
    await expect(screen.getByTestId("stat-tile-walks")).toContainText("30m");
    await expect(room).toContainText("Updated");
  });

  test("a skipped meal makes the pet hungry; a cat has no walks tile", async ({ page }) => {
    await setup(page, (db) => {
      db.pets.push(pet("pet-mochi", "Mochi", "cat"));
      db.care_checkins.push(checkin("pet-mochi", "meal", "none", 1), checkin("pet-mochi", "walk", "20", 1));
    });
    const screen = app(page);
    await screen.getByTestId("home-pager-tab-1").click();
    await expect(screen.getByTestId("pet-room-Mochi-mood")).toHaveText("Hungry");
    await expect(screen.getByTestId("stat-tile-meal")).toContainText("Hungry");
    await expect(screen.getByTestId("stat-tile-walks")).toHaveCount(0);
  });

  test("several pets: switch between them", async ({ page }) => {
    await setup(page, (db) => {
      db.pets.push(pet("pet-max", "Max", "dog"), pet("pet-mochi", "Mochi", "cat", { created_at: "2026-10-02T09:00:00Z" }));
      db.care_checkins.push(checkin("pet-mochi", "mood", "tired", 1), checkin("pet-mochi", "meal", "all", 1));
    });
    const screen = app(page);
    await screen.getByTestId("home-pager-tab-1").click();
    await expect(screen.getByTestId("pet-room-Max")).toBeVisible();
    await screen.getByTestId("pet-switch").click();
    await screen.getByTestId("pet-switch-menu").getByText("Mochi", { exact: true }).click();
    await expect(screen.getByTestId("pet-room-Mochi-mood")).toHaveText("Tired");
    await expect(screen.getByTestId("pet-room-Max")).toHaveCount(0);
  });

  test("the card flips with the tabs, a mouse drag and a sideways wheel", async ({ page }) => {
    await setup(page, (db) => db.pets.push(pet("pet-max", "Max", "dog")));
    const screen = app(page);
    const clip = await box(screen.getByTestId("home-pager-page-0"));
    // Start low in the page, away from the pet card, which has its own press.
    const from = { x: clip.x + clip.width * 0.85, y: clip.y + clip.height * 0.8 };
    await drag(page, from, { x: clip.x + clip.width * 0.15, y: from.y });
    await expect(screen.getByTestId("pet-room-Max")).toBeVisible();
    await expect(screen.getByTestId("home-pager-tab-1")).toHaveAttribute("aria-selected", "true");

    await screen.getByTestId("home-pager-tab-0").click();
    await expect(screen.getByTestId("pet-card-Max")).toBeVisible();

    const c = center(await box(screen.getByTestId("home-pager-page-0")));
    await page.mouse.move(c.x, c.y);
    await page.mouse.wheel(120, 0);
    await expect(screen.getByTestId("pet-room-Max")).toBeVisible();
  });

  test("the pet card shows the cover photo, and the emoji only without one", async ({ page }) => {
    await setup(page, (db) => {
      db.pets.push(pet("pet-max", "Max", "dog"), pet("pet-mochi", "Mochi", "cat", { created_at: "2026-10-02T09:00:00Z" }));
      db.pet_photos.push({ id: "ph1", pet_id: "pet-max", public_id: "goldito/pet-profile/x/1", position: 0 });
    });
    const screen = app(page);
    await expect(screen.getByTestId("pet-card-photo-Max")).toBeVisible();
    await expect(screen.getByTestId("pet-card-photo-Mochi")).toHaveCount(0);
  });

  test("the room is a picture, not a button: tapping it stays on Home", async ({ page }) => {
    await setup(page, (db) => db.pets.push(pet("pet-max", "Max", "dog")));
    const screen = app(page);
    await screen.getByTestId("home-pager-tab-1").click();
    await expect(screen.getByTestId("pet-room-Max-open")).toHaveAttribute("role", "img");
    await screen.getByTestId("pet-room-Max-open").click();
    await expect(page).toHaveURL(/\/owner$/);
  });

  test("the breed picks the head and the weight the size: a small dog takes less of the screen", async ({ page }) => {
    await setup(page, (db) => {
      db.pets.push(pet("pet-max", "Max", "dog", { breed: "Maltese", weight_kg: 4 }));
      db.pets.push(pet("pet-rex", "Rex", "dog", { breed: "German Shepherd", weight_kg: 32, created_at: "2026-10-02T09:00:00Z" }));
    });
    const screen = app(page);
    await screen.getByTestId("home-pager-tab-1").click();
    await page.waitForTimeout(600); // the flip changes the box size until it ends
    const small = await box(screen.getByTestId("pet-room-Max-sprite"));
    const roomMax = await box(screen.getByTestId("pet-room-Max-open"));
    await screen.getByTestId("pet-switch").click();
    await screen.getByTestId("pet-switch-menu").getByText("Rex", { exact: true }).click();
    const big = await box(screen.getByTestId("pet-room-Rex-sprite"));
    expect(small.width).toBeLessThan(big.width * 0.8);
    // The screen keeps its height, so switching pets doesn't jump the page.
    expect((await box(screen.getByTestId("pet-room-Rex-open"))).height).toBeCloseTo(roomMax.height, -1);
  });

  test("the room tops the Pet room in full view, and the pet is the biggest thing in it", async ({ page }) => {
    await setup(page, (db) => db.pets.push(pet("pet-rex", "Rex", "dog", { breed: "German Shepherd", weight_kg: 32 })));
    const screen = app(page);
    await screen.getByTestId("home-pager-tab-1").click();
    await page.waitForTimeout(600); // the flip changes the box size until it ends
    const page1 = await box(screen.getByTestId("home-pager-page-1"));
    const room = await box(screen.getByTestId("pet-room-Rex-open"));
    expect(room.y + room.height).toBeLessThanOrEqual(page1.y + page1.height + 1);
    expect(room.height).toBeGreaterThan(page1.height * 0.3);
    expect((await box(screen.getByTestId("pet-room-Rex-sprite"))).height).toBeGreaterThan(room.height * 0.4);
  });

  test("Match colors from photo: the colors are saved to the pet, and Use the coat color takes them back", async ({ page }) => {
    await fakePetPhoto(page);
    const db = await setup(page, (db) =>
      db.pets.push(pet("pet-max", "Max", "dog", { breed: "Maltese", profile: { coat: "white", v: 1, pixel_head: { v: 1 } } })),
    );
    const screen = app(page);
    await screen.getByTestId("home-pager-tab-1").click();
    const sprite = screen.getByTestId("pet-room-Max-sprite");
    const coat = await colorsOf(sprite);

    await screen.getByTestId("pet-colors-open").click();
    await screen.getByTestId("pet-colors-pick").click();
    await screen.getByTestId("sample-mood_tug").click();
    await expect(screen.getByTestId("pet-colors-save")).toBeVisible();
    await screen.getByTestId("pet-colors-save").click();
    await expect(screen.getByTestId("toast")).toContainText("Max's colors saved");

    // Saved next to the owner's other answers, which stay; the old photo head is dropped.
    const profile = db.pets[0].profile as Record<string, unknown> & { pixel_colors?: { v: number; base: string } };
    expect(profile.coat).toBe("white");
    expect(profile.v).toBe(1);
    expect(profile.pixel_colors?.v).toBe(1);
    expect(profile.pixel_colors?.base).toBe("#D9A441");
    expect("pixel_head" in profile).toBe(false);
    // Same Maltese head, now golden.
    await expect.poll(() => colorsOf(sprite)).toContain("rgb(217, 164, 65)");

    await screen.getByTestId("pet-colors-open").click();
    await screen.getByTestId("pet-colors-reset").click();
    await expect(screen.getByTestId("toast")).toContainText("Back to the coat color");
    expect("pixel_colors" in (db.pets[0].profile as object)).toBe(false);
    await expect.poll(async () => JSON.stringify(await colorsOf(sprite))).toBe(JSON.stringify(coat));
  });
});

/** The background colors drawn in a sprite, sorted. */
async function colorsOf(sprite: import("@playwright/test").Locator): Promise<string[]> {
  return sprite.evaluate((el) => {
    const seen = new Set<string>();
    el.querySelectorAll("div").forEach((d) => {
      const c = getComputedStyle(d).backgroundColor;
      if (c && c !== "rgba(0, 0, 0, 0)") seen.add(c);
    });
    return [...seen].sort();
  });
}
