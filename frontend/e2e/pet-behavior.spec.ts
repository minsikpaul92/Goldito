import { expect, test } from "@playwright/test";

import { behaviorFrame, initialBehavior, stepBehavior, type Behavior } from "../features/pets/petBehavior";
import { normalizePose } from "../features/pets/sprites/scene";
import type { PetMood } from "../lib/petStatus";

// What the pet does in its room (11.12b): a pure step function. No browser needed.

/** A small seeded random number generator, so a failure repeats. */
function seeded(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function run(mood: PetMood, ticks: number, maxX = 40, seed = 1, from: Behavior = initialBehavior()) {
  const rand = seeded(seed);
  const states: Behavior[] = [from];
  for (let i = 0; i < ticks; i++) states.push(stepBehavior(states[i], mood, rand, maxX));
  return states;
}
const kinds = (states: Behavior[]) => new Set(states.map((s) => `${s.view}-${s.action}`));

test.describe("pet behavior", () => {
  test("the pet stays inside the room and only ever takes poses that exist", () => {
    // Plain checks in the loop (thousands of ticks); one expect at the end.
    const problems: string[] = [];
    for (const mood of ["excited", "calm", "tired", "hungry", "sleepy"] as PetMood[]) {
      for (const maxX of [0, 3, 40]) {
        for (const s of run(mood, 3000, maxX, 7)) {
          const pose = normalizePose({ view: s.view, action: s.action, frame: behaviorFrame(s) });
          if (s.x < 0 || s.x > maxX) problems.push(`${mood} ${maxX}: x ${s.x}`);
          if (pose.view !== s.view || pose.action !== s.action) problems.push(`${mood}: ${s.view} ${s.action}`);
        }
      }
    }
    expect(problems).toEqual([]);
  });

  test("a calm pet does a bit of everything: walks, looks at you, looks away, stands in profile and lies down", () => {
    const seen = kinds(run("calm", 4000, 40, 3));
    for (const kind of ["side-walk", "front-idle", "side-idle", "back-idle", "side-lie"]) expect(seen).toContain(kind);
  });

  test("a sleepy pet lies down at once and stays down", () => {
    const states = run("sleepy", 600, 40, 5, { ...initialBehavior(), action: "walk", view: "side", hold: 20 });
    expect(states[1].action).toBe("lie");
    expect(states.slice(1).every((s) => s.action === "lie" && s.view === "side")).toBe(true);
  });

  test("an excited or hungry pet gets up from a nap and does not lie down again", () => {
    for (const mood of ["excited", "hungry"] as PetMood[]) {
      const asleep: Behavior = { ...initialBehavior(), view: "side", action: "lie", hold: 90 };
      const states = run(mood, 2000, 40, 9, asleep);
      expect(states[1].action).toBe("idle");
      expect(states.slice(1).some((s) => s.action === "lie")).toBe(false);
      expect(states.filter((s) => s.action === "walk").length).toBeGreaterThan(300);
    }
  });

  test("a tired pet rests more than a calm one, and a happy one walks more", () => {
    const share = (mood: PetMood, action: string) => run(mood, 6000, 40, 11).filter((s) => s.action === action).length / 6001;
    expect(share("tired", "lie")).toBeGreaterThan(share("calm", "lie"));
    expect(share("excited", "walk")).toBeGreaterThan(share("calm", "walk"));
  });

  test("at a wall the pet looks at you, then walks back the other way", () => {
    const rand = seeded(2);
    let b: Behavior = { view: "side", action: "walk", facing: "right", x: 38, age: 0, hold: 30 };
    for (let i = 0; i < 4; i++) b = stepBehavior(b, "calm", rand, 40);
    expect(b.view).toBe("front");
    expect(b.facing).toBe("left");
    expect(b.x).toBeLessThanOrEqual(40);
    // Once it walks again from there it goes left.
    let walkedLeft = false;
    for (let i = 0; i < 200 && !walkedLeft; i++) {
      b = stepBehavior(b, "excited", rand, 40);
      if (b.action === "walk" && b.view === "side") walkedLeft = b.facing === "left";
    }
    expect(walkedLeft).toBe(true);
  });

  test("a room with no space leaves the pet standing where it is", () => {
    expect(run("excited", 500, 0, 4).every((s) => s.x === 0)).toBe(true);
  });

  test("walking changes the frame every tick; standing changes it slowly", () => {
    expect(behaviorFrame({ ...initialBehavior(), action: "walk", age: 3 })).toBe(3);
    expect(behaviorFrame({ ...initialBehavior(), action: "idle", age: 3 })).toBe(1);
    expect(behaviorFrame({ ...initialBehavior(), action: "idle", age: 2 })).toBe(0);
  });
});
