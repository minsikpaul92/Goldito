import { expect, test } from "@playwright/test";

import { asPetRecipe, petRows, presetFor, recipeFor } from "../features/pets/sprites/petLook";
import { NOON_TORONTO, app, signIn } from "./helpers";
import { OWNER, SITTER, mockSupabase, type MockDb, type MockUser } from "./supabaseMock";

// The pet's look (11.12c, Pet maker): every pet is drawn by petgen.js from a recipe (breed, coat or photo colors,
// weight). Only admins (EXPO_PUBLIC_ADMIN_EMAILS, admin@goldito.test in the e2e build) can change it on the Look
// screen; the saved look lives in `pets.profile.pixel_look`.

/** The owner's own account on the admin list (same pets as OWNER). */
const ADMIN: MockUser = { ...OWNER, email: "admin@goldito.test" };

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

async function start(page: import("@playwright/test").Page, seed: (db: MockDb) => void, user: MockUser = ADMIN) {
  await page.clock.install({ time: NOON_TORONTO });
  await page.clock.resume();
  const { db } = await mockSupabase(page, [user, SITTER], { now: NOON_TORONTO });
  seed(db);
  await signIn(page, user);
  return db;
}

/** How many pixels of one color the pet in its room is drawn with. */
const pixelsOf = (screen: ReturnType<typeof app>, testId: string, color: string) =>
  screen.getByTestId(testId).evaluate((el, c) => [...el.querySelectorAll("div")].filter((d) => getComputedStyle(d).backgroundColor === c).length, color);

test.describe("pet look", () => {
  test("a breed picks its preset, weight picks the build, and only drawable looks are kept", () => {
    expect(presetFor("dog", "Golden Retriever mix")?.name).toBe("Golden retriever");
    expect(presetFor("dog", "Black lab")?.name).toBe("Labrador (black)");
    expect(presetFor("dog", "labrador (black)")?.name).toBe("Labrador (black)");
    expect(presetFor("cat", "Maine Coon")?.name).toBe("Maine coon");
    expect(presetFor("cat", "Golden retriever")).toBeNull();
    expect(presetFor("dog", "")).toBeNull();

    expect(recipeFor({ species: "dog", breed: "Golden retriever", weightKg: 40 }).build).toBe(1);
    expect(recipeFor({ species: "dog", breed: "Golden retriever", weightKg: 20 }).build).toBe(-1);
    expect(recipeFor({ species: "cat" }).base).toBe("tabby");
    // A saved look wins, unless it is the other species.
    expect(recipeFor({ species: "dog", look: { base: "husky" } }).base).toBe("husky");
    expect(recipeFor({ species: "dog", look: { base: "tabby" } }).base).toBe("dog");

    expect(asPetRecipe({ base: "dalmatian", coat: "fluffy", colors: { coat: "#FFFFFF", dark: "nope" }, junk: 1 })).toEqual({ base: "dalmatian", coat: "fluffy", colors: { coat: "#FFFFFF" } });
    for (const bad of [null, "dog", { base: "unicorn" }, { base: 3 }]) expect(asPetRecipe(bad)).toBeNull();

    // Every pose draws 32 x 32, facing left is the mirror.
    const right = petRows({ base: "dog" }, { mood: "calm", pose: { view: "side", action: "walk", frame: 1 } });
    const left = petRows({ base: "dog" }, { mood: "calm", pose: { view: "side", action: "walk", frame: 1 }, facing: "left" });
    expect(right).toHaveLength(32);
    expect(right.every((row) => row.length === 32)).toBe(true);
    expect(left[20]).toEqual([...right[20]].reverse());
  });

  test("an owner who is not an admin sees the Wardrobe and the Pixel pet card, but cannot edit the look", async ({ page }) => {
    await start(page, (d) => d.pets.push(pet("pet-max", "Max", { breed: "Golden retriever" })), OWNER);
    const screen = app(page);
    await screen.getByTestId("home-pager-flip").click();
    await expect(screen.getByTestId("pet-wardrobe")).toBeVisible();
    await expect(screen.getByTestId("pet-wardrobe-soon")).toBeVisible();
    await expect(screen.getByTestId("pet-look-open")).toHaveCount(0);
    await expect(screen.getByTestId("pet-colors-open")).toHaveCount(0); // moved to the pet profile

    await page.goto("/owner/pets/pet-max");
    await expect(screen.getByTestId("pet-pixel-card")).toBeVisible();
    await expect(screen.getByTestId("pet-colors-open")).toBeVisible();
    await expect(screen.getByTestId("pet-pixel-edit")).toHaveCount(0);

    await page.goto("/owner/pets/pet-max/look");
    await expect(screen.getByText("Looks are set by the Goldito team")).toBeVisible();
    await expect(screen.getByTestId("look-save")).toHaveCount(0);
  });

  test("an admin changes the look on the Look screen, it shows in the room and is saved with the rest of the profile", async ({ page }) => {
    const db = await start(page, (d) => d.pets.push(pet("pet-max", "Max", { breed: "Golden retriever", profile: { coat: "golden", note: "keep me" } })));
    const screen = app(page);
    await screen.getByTestId("home-pager").waitFor();
    await screen.getByTestId("home-pager-flip").click();
    await expect(screen.getByTestId("pet-room-Max-sprite")).toBeVisible();
    const BLACK = "rgb(43, 37, 34)"; // the Dalmatian's spots and ears
    expect(await pixelsOf(screen, "pet-room-Max-sprite", BLACK)).toBe(0);

    await screen.getByTestId("pet-look-open").click();
    await expect(screen.getByTestId("look-sprite")).toBeVisible();
    await screen.getByTestId("look-breed-search").fill("dalm");
    await screen.getByTestId("look-breed-Dalmatian").click();
    await screen.getByTestId("look-save").click();

    await expect.poll(() => (db.pets[0].profile as { pixel_look?: { base?: string } }).pixel_look?.base).toBe("dalmatian");
    expect(db.pets[0].profile).toMatchObject({ coat: "golden", note: "keep me" });
    await expect(screen.getByTestId("pet-room-Max-sprite")).toBeVisible();
    await expect.poll(() => pixelsOf(screen, "pet-room-Max-sprite", BLACK)).toBeGreaterThan(0);
    // On the pet profile the card says who set it, and matching colors is not offered (a saved look wins).
    await page.goto("/owner/pets/pet-max");
    await expect(screen.getByTestId("pet-pixel-card")).toContainText("Look set by the Goldito team");
    await expect(screen.getByTestId("pet-colors-open")).toHaveCount(0);

    // Back to the breed look: the saved look is removed and the rest stays.
    await screen.getByTestId("pet-pixel-edit").click();
    await screen.getByTestId("look-reset").click();
    await expect.poll(() => db.pets[0].profile).toEqual({ coat: "golden", note: "keep me" });
    await expect(screen.getByTestId("pet-colors-open")).toBeVisible();
  });

  test("options change the preview right away", async ({ page }) => {
    await start(page, (d) => d.pets.push(pet("pet-max", "Max")));
    const screen = app(page);
    await screen.getByTestId("home-pager-flip").click();
    await screen.getByTestId("pet-look-open").click();
    const sprite = screen.getByTestId("look-sprite");
    await expect(sprite).toBeVisible();
    const before = await sprite.innerHTML();
    await screen.getByTestId("look-tabs").getByText("Markings").click();
    await screen.getByTestId("look-face").getByText("Dark mask").click();
    await expect.poll(() => sprite.innerHTML()).not.toBe(before);
    await screen.getByTestId("look-tabs").getByText("Colors").click();
    await screen.getByTestId("look-color-coat-1E1A1A").click();
    await expect(screen.getByTestId("look-color-coat-1E1A1A")).toHaveAttribute("aria-checked", "true");
  });
});
