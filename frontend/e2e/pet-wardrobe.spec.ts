import { expect, test } from "@playwright/test";

import { asHat, ownedItems } from "../features/pets/items";
import { caring } from "./careFixtures";
import { NOON_TORONTO, app, signIn } from "./helpers";
import { OWNER, SITTER, mockSupabase, type MockDb } from "./supabaseMock";

// The wardrobe (11.12b): the Halloween pumpkin hat, free for every owner during the open event; the pet wears it in
// its room on both Homes.

const MAX = "00000000-0000-4000-8000-0000000000aa";
const PUMPKIN = "rgb(242, 140, 40)";

const pet = (id: string, name: string, extra: object = {}) => ({
  id,
  owner_id: OWNER.id,
  species: "dog",
  name,
  breed: null,
  birthdate: null,
  weight_kg: null,
  notes: null,
  created_at: "2026-10-01T09:00:00Z",
  ...extra,
});

async function start(page: import("@playwright/test").Page, seed: (db: MockDb) => void, user = OWNER) {
  await page.clock.install({ time: NOON_TORONTO });
  await page.clock.resume();
  const { db } = await mockSupabase(page, [OWNER, SITTER], { now: NOON_TORONTO });
  seed(db);
  await signIn(page, user);
  return db;
}

/** How many pumpkin-colored pixels the pet in a room is drawn with. */
const pumpkinPixels = (screen: ReturnType<typeof app>, name: string) =>
  screen.getByTestId(`pet-room-${name}-sprite`).evaluate((el, color) => [...el.querySelectorAll("div")].filter((d) => getComputedStyle(d).backgroundColor === color).length, PUMPKIN);

test.describe("wardrobe", () => {
  test("during the open event every owner has the pumpkin hat, and a saved hat is checked", () => {
    expect(ownedItems(0).map((i) => i.id)).toEqual(["pumpkin"]);
    expect(ownedItems(2).map((i) => i.id)).toEqual(["pumpkin"]);
    expect(asHat("pumpkin")).toBe("pumpkin");
    for (const bad of ["crown", "", null, undefined, 3, "toString", "__proto__"]) expect(asHat(bad)).toBeNull();
  });


  test("every owner can put the pumpkin hat on and take it off, and the rest of the profile stays", async ({ page }) => {
    const db = await start(page, (d) => d.pets.push(pet("pet-max", "Max", { profile: { coat: "cream", note: "keep me" } })));
    const screen = app(page);
    await screen.getByTestId("home-pager").waitFor();
    await screen.getByTestId("home-pager-flip").click();
    await expect(screen.getByTestId("pet-room-Max-sprite")).toBeVisible();
    await expect(screen.getByTestId("pet-hat-pumpkin")).toHaveAttribute("aria-pressed", "false");
    expect(await pumpkinPixels(screen, "Max")).toBe(0);

    await screen.getByTestId("pet-hat-pumpkin").click();
    await expect(screen.getByTestId("pet-hat-pumpkin")).toHaveAttribute("aria-pressed", "true");
    await expect.poll(() => pumpkinPixels(screen, "Max")).toBeGreaterThan(0);
    await expect.poll(() => db.pets[0].profile).toEqual({ coat: "cream", note: "keep me", hat: "pumpkin" });

    // Still on after the pets are loaded again.
    await page.reload();
    await screen.getByTestId("home-pager-flip").click();
    await expect(screen.getByTestId("pet-hat-pumpkin")).toHaveAttribute("aria-pressed", "true");
    await expect.poll(() => pumpkinPixels(screen, "Max")).toBeGreaterThan(0);

    await screen.getByTestId("pet-hat-pumpkin").click();
    await expect.poll(() => pumpkinPixels(screen, "Max")).toBe(0);
    await expect.poll(() => db.pets[0].profile).toEqual({ coat: "cream", note: "keep me" });
  });

  test("each pet has its own hat", async ({ page }) => {
    await start(page, (d) => d.pets.push(pet("pet-max", "Max"), pet("pet-mochi", "Mochi", { species: "cat", created_at: "2026-10-02T09:00:00Z" })));
    const screen = app(page);
    await screen.getByTestId("home-pager-flip").click();
    await screen.getByTestId("pet-hat-pumpkin").click();
    await expect.poll(() => pumpkinPixels(screen, "Max")).toBeGreaterThan(0);
    await screen.getByTestId("pet-switch-Mochi").click();
    await expect(screen.getByTestId("pet-hat-pumpkin")).toHaveAttribute("aria-pressed", "false");
    expect(await pumpkinPixels(screen, "Mochi")).toBe(0);
  });

  test("a hat that is not a hat we know is ignored", async ({ page }) => {
    await start(page, (d) => d.pets.push(pet("pet-max", "Max", { profile: { hat: "crown" } })));
    const screen = app(page);
    await screen.getByTestId("home-pager-flip").click();
    await expect(screen.getByTestId("pet-hat-pumpkin")).toHaveAttribute("aria-pressed", "false");
    expect(await pumpkinPixels(screen, "Max")).toBe(0);
  });

  test("the sitter sees the hat on the pet in care", async ({ page }) => {
    await start(
      page,
      (d) => {
        caring(d, [{ id: MAX, name: "Max", species: "dog" }], NOON_TORONTO);
        d.pets.find((p) => p.id === MAX)!.profile = { coat: "cream", hat: "pumpkin" };
      },
      SITTER,
    );
    const screen = app(page);
    await screen.getByTestId("home-pager-flip").click();
    await screen.getByTestId("pet-room-Max-sprite").waitFor();
    await expect.poll(() => pumpkinPixels(screen, "Max")).toBeGreaterThan(0);
  });
});
