import { expect, test } from "@playwright/test";

import { asPixelColors } from "../features/pets/sprites/photoColors";
import { COAT_PALETTES, SHAPES, SPRITE_SIZE, petShape, resolveCoat, spriteKey, spritePixels } from "../features/pets/sprites/sprites";
import type { PetMood } from "../lib/petStatus";
import { app } from "./helpers";
import { fakePetPhoto } from "./pixelHooks";

// Placeholder pixel pets (11.12, #184): shapes, coats, moods and keys (no browser needed), and colors from a photo in
// the dev gallery with MediaPipe replaced by test hooks.

const MOODS: PetMood[] = ["excited", "calm", "tired", "hungry", "sleepy"];
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

test.describe("pet sprites", () => {
  test("every species x shape x coat x mood is a 16x16 grid with something drawn", () => {
    for (const species of ["dog", "cat"] as const) {
      for (const shape of SHAPES[species]) {
        for (const coat of Object.keys(COAT_PALETTES)) {
          for (const mood of MOODS) {
            const px = spritePixels(species, coat, mood, shape);
            expect(px).toHaveLength(SPRITE_SIZE);
            for (const row of px) expect(row).toHaveLength(SPRITE_SIZE);
            expect(px.flat().some((c) => c !== null)).toBe(true);
          }
        }
      }
    }
  });

  test("every shape keeps the face on the head: a mood only recolors pixels, it never draws in the air", () => {
    for (const species of ["dog", "cat"] as const) {
      for (const shape of SHAPES[species]) {
        const empty = spritePixels(species, "golden", "calm", shape).flat().map((c) => c === null);
        for (const mood of MOODS.filter((m) => m !== "sleepy")) {
          const px = spritePixels(species, "golden", mood, shape).flat();
          expect(px.map((c) => c === null), `${species} ${shape} ${mood}`).toEqual(empty);
        }
      }
    }
    const shapes = SHAPES.dog.map((shape) => JSON.stringify(spritePixels("dog", "golden", "calm", shape)));
    expect(new Set(shapes).size).toBe(4);
  });

  test("the breed the owner typed picks the head shape", () => {
    expect(petShape("dog", "Golden Retriever")).toBe("floppy");
    expect(petShape("dog", "Maltese")).toBe("fluffy");
    expect(petShape("dog", "toy poodle mix")).toBe("fluffy");
    expect(petShape("dog", "Siberian Husky")).toBe("pointy");
    expect(petShape("dog", "German Shepherd")).toBe("pointy");
    expect(petShape("dog", "Australian Shepherd")).toBe("floppy");
    expect(petShape("dog", "French Bulldog")).toBe("flat");
    expect(petShape("dog", "Pug")).toBe("flat");
    expect(petShape("dog", "mutt")).toBe("floppy");
    expect(petShape("dog", null)).toBe("floppy");
    expect(petShape("cat", "Maine Coon")).toBe("long");
    expect(petShape("cat", "Domestic Shorthair")).toBe("short");
    expect(petShape("cat", "Pug")).toBe("short"); // a dog word never gives a cat a dog's head
  });

  test("the five moods look different, and a cat is not a dog", () => {
    const looks = MOODS.map((m) => JSON.stringify(spritePixels("dog", "golden", m)));
    expect(new Set(looks).size).toBe(5);
    expect(same(spritePixels("dog", "golden", "calm"), spritePixels("cat", "golden", "calm"))).toBe(false);
  });

  test("a coat only recolors: the same pixels stay transparent", () => {
    const a = spritePixels("dog", "white", "calm").flat().map((c) => c === null);
    const b = spritePixels("dog", "black", "calm").flat().map((c) => c === null);
    expect(same(a, b)).toBe(true);
  });

  test("an unknown or missing coat falls back to a generic dog or cat", () => {
    expect(resolveCoat("dog", undefined)).toBe("golden");
    expect(resolveCoat("cat", "rainbow")).toBe("orange");
    expect(resolveCoat("cat", "gray")).toBe("gray");
    expect(spriteKey("dog", "", "sleepy")).toBe("dog_floppy_golden_sleepy");
    expect(spriteKey("cat", "black", "calm")).toBe("cat_short_black_calm");
    expect(spriteKey("dog", "white", "calm", "fluffy")).toBe("dog_fluffy_white_calm");
  });

  test("saved photo colors are checked, then paint the preset without moving a pixel", () => {
    const colors = asPixelColors({ v: 1, base: "#CC2222", shade: "#661111", light: "#FFAAAA" });
    expect(colors).not.toBeNull();
    const coat = spritePixels("dog", "golden", "calm", "fluffy");
    const painted = spritePixels("dog", "golden", "calm", "fluffy", colors);
    expect(painted.flat().map((c) => c === null)).toEqual(coat.flat().map((c) => c === null));
    expect(painted.flat()).toContain("#CC2222");
    expect(painted.flat()).not.toContain(COAT_PALETTES.golden.base);
    expect(asPixelColors({ v: 1, base: "red", shade: "#661111", light: "#FFAAAA" })).toBeNull();
    expect(asPixelColors({ base: "#CC2222", shade: "#661111", light: "#FFAAAA" })).toBeNull();
    expect(asPixelColors(null)).toBeNull();
  });
});

test.describe("colors from a photo", () => {
  test("the cut-out pet's main colors paint the preset: the coat, a darker shade and a lighter muzzle", async ({ page }) => {
    await fakePetPhoto(page);
    await page.goto("/dev/sprites");
    const screen = app(page);
    await screen.getByTestId("sprite-pick-photo").click();
    await screen.getByTestId("sample-mood_tug").click();
    const sprite = screen.getByTestId("sprite-from-photo");
    await expect(sprite).toBeVisible();
    const colors = await sprite.evaluate((el) => {
      const seen = new Set<string>();
      el.querySelectorAll("div").forEach((d) => {
        const c = getComputedStyle(d).backgroundColor;
        if (c && c !== "rgba(0, 0, 0, 0)") seen.add(c);
      });
      return [...seen];
    });
    // The fake dog is golden (#D9A441) with brown ears and a cream muzzle on blue: golden is the coat, blue is cut away.
    expect(colors).toContain("rgb(217, 164, 65)");
    expect(colors).not.toContain("rgb(136, 170, 204)");
  });
});
