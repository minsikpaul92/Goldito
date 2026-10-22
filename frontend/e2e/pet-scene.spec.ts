import { expect, test } from "@playwright/test";

import { HATS } from "../features/pets/sprites/hats";
import { SCENE_SIZE, frameCount, normalizePose, spriteScene, type Action, type Pose, type View } from "../features/pets/sprites/scene";
import { SHAPES } from "../features/pets/sprites/sprites";
import type { PetMood } from "../lib/petStatus";

// The whole pet, drawn in code (11.12b): 32x32 scenes in three views, walking, lying down, and a hat. No browser needed.

const MOODS: PetMood[] = ["excited", "calm", "tired", "hungry", "sleepy"];
const POSES: Pose[] = [
  ...[0, 1].map((frame) => ({ view: "front" as View, action: "idle" as Action, frame })),
  ...[0, 1].map((frame) => ({ view: "back" as View, action: "idle" as Action, frame })),
  ...[0, 1].map((frame) => ({ view: "side" as View, action: "idle" as Action, frame })),
  ...[0, 1, 2, 3].map((frame) => ({ view: "side" as View, action: "walk" as Action, frame })),
  ...[0, 1].map((frame) => ({ view: "side" as View, action: "lie" as Action, frame })),
];
const species = ["dog", "cat"] as const;
const shapesOf = (sp: (typeof species)[number]) => SHAPES[sp];
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const drawn = (px: (string | null)[][]) => px.flat().filter((c) => c !== null);
const lowest = (px: (string | null)[][]) => Math.max(...px.map((row, y) => (row.some((c) => c !== null) ? y : -1)));

test.describe("pet scene", () => {
  test("every species, shape, mood and pose is a 32x32 picture with something drawn", () => {
    for (const sp of species) {
      for (const shape of shapesOf(sp)) {
        for (const mood of MOODS) {
          for (const pose of POSES) {
            const px = spriteScene({ species: sp, shape, mood, pose });
            expect(px).toHaveLength(SCENE_SIZE);
            for (const row of px) expect(row).toHaveLength(SCENE_SIZE);
            expect(drawn(px).length).toBeGreaterThan(150);
          }
        }
      }
    }
  });

  test("a pose that does not exist becomes idle, and the frame wraps", () => {
    expect(normalizePose({ view: "front", action: "walk", frame: 3 })).toEqual({ view: "front", action: "idle", frame: 1 });
    expect(normalizePose({ view: "back", action: "lie", frame: 0 })).toEqual({ view: "back", action: "idle", frame: 0 });
    expect(normalizePose({ view: "side", action: "walk", frame: 5 })).toEqual({ view: "side", action: "walk", frame: 1 });
    expect(normalizePose({ view: "side", action: "lie", frame: -1 })).toEqual({ view: "side", action: "lie", frame: 1 });
    expect(frameCount("side", "walk")).toBe(4);
    expect(frameCount("front", "idle")).toBe(2);
  });

  test("the pet stands on the floor: the lowest pixel is in the last rows, never past the picture", () => {
    for (const sp of species) {
      for (const pose of POSES) {
        const y = lowest(spriteScene({ species: sp, shape: shapesOf(sp)[0], mood: "calm", pose }));
        expect(y).toBeGreaterThanOrEqual(28);
        expect(y).toBeLessThanOrEqual(SCENE_SIZE - 1);
      }
    }
  });

  test("the walk has four different frames, and left is the right-facing picture mirrored", () => {
    const frames = [0, 1, 2, 3].map((frame) => JSON.stringify(spriteScene({ species: "dog", shape: "floppy", mood: "calm", pose: { view: "side", action: "walk", frame } })));
    expect(new Set(frames).size).toBe(4);
    const right = spriteScene({ species: "dog", shape: "floppy", mood: "calm", pose: { view: "side", action: "walk", frame: 1 } });
    const left = spriteScene({ species: "dog", shape: "floppy", mood: "calm", pose: { view: "side", action: "walk", frame: 1 }, facing: "left" });
    expect(same(left, right.map((row) => [...row].reverse()))).toBe(true);
  });

  test("the three views and the idle frames look different, in every shape", () => {
    for (const sp of species) {
      for (const shape of shapesOf(sp)) {
        const look = (view: View, frame = 0) => JSON.stringify(spriteScene({ species: sp, shape, mood: "calm", pose: { view, action: "idle", frame } }));
        expect(new Set([look("front"), look("side"), look("back")]).size).toBe(3);
        expect(look("front", 0)).not.toBe(look("front", 1));
      }
    }
  });

  test("a coat only recolors: the same pixels stay transparent in every pose", () => {
    for (const pose of POSES) {
      const a = spriteScene({ species: "dog", shape: "pointy", coat: "white", mood: "calm", pose }).flat().map((c) => c === null);
      const b = spriteScene({ species: "dog", shape: "pointy", coat: "black", mood: "calm", pose }).flat().map((c) => c === null);
      expect(same(a, b)).toBe(true);
    }
  });

  test("a lying pet is always asleep, with its Z", () => {
    for (const mood of MOODS) {
      const lie = spriteScene({ species: "cat", shape: "short", mood, pose: { view: "side", action: "lie", frame: 0 } });
      const asleep = spriteScene({ species: "cat", shape: "short", mood: "sleepy", pose: { view: "side", action: "lie", frame: 0 } });
      expect(same(lie, asleep)).toBe(true);
    }
    const z = spriteScene({ species: "cat", shape: "short", mood: "sleepy", pose: { view: "front", action: "idle", frame: 0 } });
    expect(z.flat()).toContain("#7C83B8");
    const awake = spriteScene({ species: "cat", shape: "short", mood: "calm", pose: { view: "front", action: "idle", frame: 0 } });
    expect(awake.flat()).not.toContain("#7C83B8");
  });

  test("the pumpkin hat sits on the head in every view, shape and pose, in its own colors", () => {
    expect(HATS.pumpkin.name).toBe("Pumpkin hat");
    const orange = "#F28C28";
    for (const sp of species) {
      for (const shape of shapesOf(sp)) {
        for (const pose of POSES) {
          const bare = spriteScene({ species: sp, shape, coat: "white", mood: "calm", pose });
          const hat = spriteScene({ species: sp, shape, coat: "white", mood: "calm", pose, hat: "pumpkin" });
          expect(bare.flat()).not.toContain(orange);
          expect(hat.flat().filter((c) => c === orange).length).toBeGreaterThan(15);
          // The hat is above the middle of the picture and inside it (nothing was cut off).
          const rows = hat.map((row) => row.includes(orange));
          const firstHatRow = rows.indexOf(true);
          expect(firstHatRow).toBeGreaterThanOrEqual(0);
          expect(firstHatRow).toBeLessThan(16);
          const stem = hat.flat().filter((c) => c === "#4C8C2B").length;
          expect(stem).toBeGreaterThanOrEqual(4);
        }
      }
    }
  });

  test("the hat is the same on every coat, the pet keeps its coat under it", () => {
    const pose: Pose = { view: "front", action: "idle", frame: 0 };
    const white = spriteScene({ species: "dog", shape: "floppy", coat: "white", mood: "calm", pose, hat: "pumpkin" });
    const black = spriteScene({ species: "dog", shape: "floppy", coat: "black", mood: "calm", pose, hat: "pumpkin" });
    expect(white.flat().filter((c) => c === "#F28C28").length).toBe(black.flat().filter((c) => c === "#F28C28").length);
    expect(same(white, black)).toBe(false);
  });
});
