import { expect, test } from "@playwright/test";

import { COAT_PALETTES, SPRITE_SIZE, resolveCoat, spriteKey, spritePixels } from "../features/pets/sprites/sprites";
import type { PetMood } from "../lib/petStatus";

// Placeholder pixel pets (11.12, #184): the grid, coats, moods and keys. No browser needed.

const MOODS: PetMood[] = ["excited", "calm", "tired", "hungry", "sleepy"];
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

test.describe("pet sprites", () => {
  test("every species x coat x mood is a 16x16 grid with something drawn", () => {
    for (const species of ["dog", "cat"] as const) {
      for (const coat of Object.keys(COAT_PALETTES)) {
        for (const mood of MOODS) {
          const px = spritePixels(species, coat, mood);
          expect(px).toHaveLength(SPRITE_SIZE);
          for (const row of px) expect(row).toHaveLength(SPRITE_SIZE);
          expect(px.flat().some((c) => c !== null)).toBe(true);
        }
      }
    }
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
    expect(spriteKey("dog", "", "sleepy")).toBe("dog_golden_sleepy");
    expect(spriteKey("cat", "black", "calm")).toBe("cat_black_calm");
  });
});
