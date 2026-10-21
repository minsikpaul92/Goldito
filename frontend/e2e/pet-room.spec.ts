import { expect, test } from "@playwright/test";

import { HOUR } from "./careFixtures";
import { NOON_TORONTO, app, box, center, drag, signIn } from "./helpers";
import { OWNER, mockSupabase, type MockDb } from "./supabaseMock";

// The pet room on owner Home (11.12, #184): a swipe pager (Today / Pet), the 8-bit pet and its HUD.

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

    await screen.getByTestId("home-pager-dot-1").click();
    await expect(screen.getByTestId("pet-room-Max")).toBeVisible();
    await expect(screen.getByTestId("pet-room-Max-sprite")).toBeVisible();
    // Nothing logged today: calm, no HUD.
    await expect(screen.getByTestId("pet-room-Max-mood")).toHaveText("Calm");
    await screen.getByTestId("home-pager-dot-0").click();
    await expect(screen.getByTestId("pet-card-Max")).toBeVisible();
  });

  test("today's check-ins set the mood and the HUD", async ({ page }) => {
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
    await screen.getByTestId("home-pager-dot-1").click();
    const room = screen.getByTestId("pet-room-Max");
    await expect(screen.getByTestId("pet-room-Max-mood")).toHaveText("Happy");
    await expect(room).toContainText("🍽️ Fed");
    await expect(room).toContainText("💩 Done");
    await expect(room).toContainText("🦮 30 min");
  });

  test("a skipped meal makes the pet hungry; a cat has no walk chip", async ({ page }) => {
    await setup(page, (db) => {
      db.pets.push(pet("pet-mochi", "Mochi", "cat"));
      db.care_checkins.push(checkin("pet-mochi", "meal", "none", 1), checkin("pet-mochi", "walk", "20", 1));
    });
    const screen = app(page);
    await screen.getByTestId("home-pager-dot-1").click();
    await expect(screen.getByTestId("pet-room-Mochi-mood")).toHaveText("Hungry");
    await expect(screen.getByTestId("pet-room-Mochi")).toContainText("🍽️ Hungry");
    await expect(screen.getByTestId("pet-room-Mochi")).not.toContainText("🦮");
  });

  test("several pets: switch between them", async ({ page }) => {
    await setup(page, (db) => {
      db.pets.push(pet("pet-max", "Max", "dog"), pet("pet-mochi", "Mochi", "cat", { created_at: "2026-10-02T09:00:00Z" }));
      db.care_checkins.push(checkin("pet-mochi", "mood", "tired", 1), checkin("pet-mochi", "meal", "all", 1));
    });
    const screen = app(page);
    await screen.getByTestId("home-pager-dot-1").click();
    await expect(screen.getByTestId("pet-room-Max")).toBeVisible();
    await screen.getByTestId("pet-switch-Mochi").click();
    await expect(screen.getByTestId("pet-room-Mochi-mood")).toHaveText("Tired");
    await expect(screen.getByTestId("pet-room-Max")).toHaveCount(0);
  });

  test("the mouse turns the page: drag left, drag right, and a sideways wheel", async ({ page }) => {
    await setup(page, (db) => db.pets.push(pet("pet-max", "Max", "dog")));
    const screen = app(page);
    const clip = await box(screen.getByTestId("home-pager-page-0"));
    // Start low in the page, away from the pet card, which has its own press.
    const from = { x: clip.x + clip.width * 0.85, y: clip.y + clip.height * 0.8 };
    await drag(page, from, { x: clip.x + clip.width * 0.15, y: from.y });
    await expect(screen.getByTestId("home-pager-dot-1")).toHaveAttribute("aria-selected", "true");
    await expect(screen.getByTestId("pet-room-Max")).toBeVisible();
    // The page moved a whole page to the left.
    await expect.poll(async () => (await box(screen.getByTestId("home-pager-page-0"))).x).toBeCloseTo(clip.x - clip.width, -1);
    const pageTwo = await box(screen.getByTestId("home-pager-page-1"));
    await drag(page, { x: pageTwo.x + pageTwo.width * 0.15, y: pageTwo.y + pageTwo.height * 0.85 }, { x: pageTwo.x + pageTwo.width * 0.85, y: pageTwo.y + pageTwo.height * 0.85 });
    await expect(screen.getByTestId("home-pager-dot-0")).toHaveAttribute("aria-selected", "true");
    await expect.poll(async () => (await box(screen.getByTestId("home-pager-page-0"))).x).toBeCloseTo(clip.x, -1);

    const c = center(await box(screen.getByTestId("home-pager-page-0")));
    await page.mouse.move(c.x, c.y);
    await page.mouse.wheel(120, 0);
    await expect(screen.getByTestId("home-pager-dot-1")).toHaveAttribute("aria-selected", "true");
  });

  test("tapping the pet opens the Diary", async ({ page }) => {
    await setup(page, (db) => db.pets.push(pet("pet-max", "Max", "dog")));
    const screen = app(page);
    await screen.getByTestId("home-pager-dot-1").click();
    await screen.getByTestId("pet-room-Max-open").click();
    await expect(page).toHaveURL(/\/owner\/diary$/);
  });
});
