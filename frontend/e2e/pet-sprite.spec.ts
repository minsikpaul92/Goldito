import { expect, test } from "@playwright/test";

import { asPixelHead, headPixels } from "../features/pets/sprites/pixelize";
import { COAT_PALETTES, SPRITE_SIZE, resolveCoat, spriteKey, spritePixels } from "../features/pets/sprites/sprites";
import type { PetMood } from "../lib/petStatus";
import { app } from "./helpers";

// Placeholder pixel pets (11.12, #184): the grid, coats, moods and keys (no browser needed), and photo to pixel head
// in the dev gallery with MediaPipe replaced by test hooks.

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

  test("a saved pixel head is checked before it is drawn", () => {
    const rows = Array.from({ length: SPRITE_SIZE }, (_, y) => (y === 8 ? "......o01o......" : "................"));
    const head = asPixelHead({ v: 1, palette: ["#D9A441", "#7A4A20"], rows });
    expect(head).not.toBeNull();
    const px = headPixels(head!);
    expect(px[8][7]).toBe("#D9A441");
    expect(px[8][6]).not.toBeNull(); // the outline
    expect(px[0][0]).toBeNull();
    expect(asPixelHead({ v: 1, palette: ["red"], rows })).toBeNull();
    expect(asPixelHead({ v: 1, palette: [], rows: rows.slice(1) })).toBeNull();
    expect(asPixelHead(null)).toBeNull();
  });
});

test.describe("photo to pixel head", () => {
  test("the cut-out pet becomes a 16x16 head of a few colors with an outline", async ({ page }) => {
    await page.addInitScript(() => {
      // A golden dog face on a blue background; the mask is the face and its two ears.
      const inside = (x: number, y: number) =>
        ((x - 200) / 110) ** 2 + ((y - 180) / 120) ** 2 <= 1 ||
        ((x - 105) / 40) ** 2 + ((y - 160) / 85) ** 2 <= 1 ||
        ((x - 295) / 40) ** 2 + ((y - 160) / 85) ** 2 <= 1;
      (window as unknown as { __goldiVision: unknown }).__goldiVision = {
        detectPets: () => [{ x: 0.2, y: 0.1, w: 0.6, h: 0.7, label: "dog", score: 0.9 }],
        loadFrames: () => {
          const c = document.createElement("canvas");
          c.width = 400;
          c.height = 400;
          const g = c.getContext("2d")!;
          g.fillStyle = "#88AACC";
          g.fillRect(0, 0, 400, 400);
          for (const [x, y, rx, ry, color] of [
            [200, 180, 110, 120, "#D9A441"],
            [105, 160, 40, 85, "#7A4A20"],
            [295, 160, 40, 85, "#7A4A20"],
            [200, 240, 55, 45, "#F6E0B0"],
          ] as const) {
            g.fillStyle = color;
            g.beginPath();
            g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
            g.fill();
          }
          return [c];
        },
        segmentAt: () => {
          const width = 200;
          const height = 200;
          const data = new Float32Array(width * height);
          for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) data[y * width + x] = inside(x * 2, y * 2) ? 1 : 0;
          return { width, height, data };
        },
      };
    });
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
    // Up to six colors and the outline; the blue background was cut away.
    expect(colors.length).toBeGreaterThanOrEqual(3);
    expect(colors.length).toBeLessThanOrEqual(7);
    expect(colors).not.toContain("rgb(136, 170, 204)");
  });
});
