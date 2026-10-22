import { expect, test } from "@playwright/test";

import { behaviorFrame, behaviorPose, initialBehavior, poopVisible, stepBehavior, triggerBehavior, wakeBehavior, type Behavior } from "../features/pets/petBehavior";
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
    let b: Behavior = { ...initialBehavior(), view: "side", action: "walk", facing: "right", x: 38, age: 0, hold: 30 };
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

  test("an eat shows the pet at its bowl for a few seconds, the bowl empties, then it carries on", () => {
    const rand = seeded(3);
    let b = triggerBehavior({ ...initialBehavior(), x: 10, facing: "left" }, "eat", "calm");
    expect(b).toMatchObject({ view: "side", action: "eat", facing: "left", age: 0 });
    expect(behaviorPose(b).progress).toBe(0);
    const progress: number[] = [];
    let ticks = 0;
    while (b.action === "eat" && ticks < 100) {
      b = stepBehavior(b, "calm", rand, 40);
      ticks++;
      if (b.action === "eat") progress.push(behaviorPose(b).progress ?? 0);
    }
    expect(ticks).toBe(20);
    expect(progress.every((p, i) => i === 0 || p >= progress[i - 1])).toBe(true);
    expect(progress[progress.length - 1]).toBeGreaterThan(0.9);
    // It stood still while it ate.
    expect(b.x).toBe(10);
  });

  test("a pet that is asleep or lying down is not woken by a feeding or a potty", () => {
    const lying: Behavior = { ...initialBehavior(), view: "side", action: "lie", hold: 50 };
    expect(triggerBehavior(lying, "eat", "tired")).toBe(lying);
    expect(triggerBehavior(initialBehavior(), "poop", "sleepy").action).toBe("idle");
  });

  test("a poop drops behind the pet once, stays a few seconds, blinks and is cleared", () => {
    for (const facing of ["right", "left"] as const) {
      const rand = seeded(5);
      let b = triggerBehavior({ ...initialBehavior(), x: 12, facing }, "poop", "calm");
      expect(b.poops).toEqual([]);
      const seen: { id: number; x: number }[] = [];
      for (let i = 0; i < 80; i++) {
        b = stepBehavior(b, "calm", rand, 40);
        for (const p of b.poops) if (!seen.some((q) => q.id === p.id)) seen.push({ id: p.id, x: p.x });
      }
      expect(seen).toHaveLength(1);
      // Behind: toward the left wall when facing right, the right when facing left; always inside the room.
      expect(seen[0].x).toBeGreaterThanOrEqual(0);
      expect(seen[0].x).toBeLessThanOrEqual(40 + 32 - 7);
      if (facing === "right") expect(seen[0].x).toBeLessThan(22);
      else expect(seen[0].x).toBeGreaterThan(30);
      // Cleared after a while.
      expect(b.poops).toEqual([]);
    }
  });

  test("a poop blinks for its last moments and a second one does not replace the first", () => {
    const rand = seeded(8);
    let b = triggerBehavior(initialBehavior(), "poop", "calm");
    const timeline: { count: number; visible: boolean[] }[] = [];
    for (let i = 0; i < 20; i++) b = stepBehavior(b, "calm", rand, 40);
    b = triggerBehavior({ ...b, view: "front", action: "idle", hold: 3 }, "poop", "calm");
    for (let i = 0; i < 80; i++) {
      b = stepBehavior(b, "calm", rand, 40);
      timeline.push({ count: b.poops.length, visible: b.poops.map(poopVisible) });
    }
    expect(Math.max(...timeline.map((t) => t.count))).toBe(2);
    expect(new Set(timeline.flatMap((t) => t.visible)).size).toBe(2);
    expect(timeline[timeline.length - 1].count).toBe(0);
  });

  test("when the pet is told it is awake it gets up and looks at you; one that was not lying is left alone", () => {
    const lying: Behavior = { ...initialBehavior(), view: "side", action: "lie", hold: 90, x: 12 };
    const up = wakeBehavior(lying);
    expect(up).toMatchObject({ view: "front", action: "idle", x: 12 });
    expect(up.hold).toBeLessThan(10);
    const walking: Behavior = { ...initialBehavior(), view: "side", action: "walk", hold: 9 };
    expect(wakeBehavior(walking)).toBe(walking);
  });
});
