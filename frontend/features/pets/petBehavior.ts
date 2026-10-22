import type { PetMood } from "../../lib/petStatus";
import type { Action, View } from "./sprites/scene";

/**
 * What the pet does in its room (11.12b): it walks left and right, stops, looks at you or away, turns around at the
 * walls and lies down to rest. The mood leans the choices: a sleepy pet lies down, a hungry or happy one keeps moving.
 * A pure step function, one tick at a time; `usePetBehavior` calls it on a timer.
 */
export type Behavior = {
  view: View;
  action: Action;
  /** Which way a side view looks. */
  facing: "left" | "right";
  /** Where the pet is, in sprite pixels from the left wall. */
  x: number;
  /** Ticks since the action began; picks the animation frame. */
  age: number;
  /** Ticks left in this action. */
  hold: number;
};

export const TICK_MS = 180;
/** Sprite pixels a walking pet covers in one tick. */
const SPEED = 1;
/** Ticks per animation frame while standing or lying (walking changes frame every tick). */
const SLOW_FRAME = 3;

type Rand = () => number;
type Choice = { view: View; action: Action; weight: number; ticks: [number, number] };

const range = ([lo, hi]: [number, number], rand: Rand) => lo + Math.floor(rand() * (hi - lo + 1));

/** What to do next, by mood: weights of each choice and how many ticks it lasts. */
const CHOICES: Record<PetMood, Choice[]> = {
  calm: [
    { view: "side", action: "walk", weight: 4, ticks: [10, 30] },
    { view: "front", action: "idle", weight: 3, ticks: [10, 22] },
    { view: "side", action: "idle", weight: 2, ticks: [8, 16] },
    { view: "back", action: "idle", weight: 1, ticks: [8, 14] },
    { view: "side", action: "lie", weight: 1, ticks: [30, 60] },
  ],
  excited: [
    { view: "side", action: "walk", weight: 7, ticks: [14, 40] },
    { view: "front", action: "idle", weight: 2, ticks: [6, 12] },
    { view: "back", action: "idle", weight: 1, ticks: [5, 9] },
  ],
  hungry: [
    { view: "side", action: "walk", weight: 5, ticks: [10, 26] },
    { view: "front", action: "idle", weight: 3, ticks: [8, 16] },
    { view: "back", action: "idle", weight: 1, ticks: [6, 12] },
  ],
  tired: [
    { view: "side", action: "lie", weight: 4, ticks: [40, 80] },
    { view: "side", action: "idle", weight: 3, ticks: [10, 20] },
    { view: "front", action: "idle", weight: 2, ticks: [10, 20] },
    { view: "side", action: "walk", weight: 1, ticks: [6, 14] },
  ],
  sleepy: [{ view: "side", action: "lie", weight: 1, ticks: [60, 120] }],
};

export function initialBehavior(): Behavior {
  return { view: "front", action: "idle", facing: "right", x: 0, age: 0, hold: 8 };
}

/** The animation frame of the current action. */
export function behaviorFrame(b: Behavior): number {
  return b.action === "walk" ? b.age : Math.floor(b.age / SLOW_FRAME);
}

function pick(mood: PetMood, rand: Rand): Choice {
  const choices = CHOICES[mood];
  let roll = rand() * choices.reduce((sum, c) => sum + c.weight, 0);
  for (const c of choices) {
    roll -= c.weight;
    if (roll < 0) return c;
  }
  return choices[0];
}

/**
 * One tick. `maxX` is how far right the pet may go (the room's width minus the pet's, in sprite pixels): it never
 * leaves [0, maxX] and turns around at a wall by looking at you for a moment first.
 */
export function stepBehavior(b: Behavior, mood: PetMood, rand: Rand, maxX: number): Behavior {
  const wall = Math.max(0, maxX);
  const age = b.age + 1;

  // A sleepy pet lies down at once; an excited or hungry one gets up.
  if (mood === "sleepy" && b.action !== "lie") {
    return { ...b, view: "side", action: "lie", age: 0, hold: range([60, 120], rand), x: Math.min(b.x, wall) };
  }
  if (b.action === "lie" && (mood === "excited" || mood === "hungry")) {
    return { ...b, view: "front", action: "idle", age: 0, hold: range([4, 8], rand) };
  }

  if (b.action === "walk") {
    const x = b.x + (b.facing === "right" ? SPEED : -SPEED);
    if (x <= 0 || x >= wall) {
      // At a wall: look at you, then walk back the other way.
      const turned = x <= 0 ? "right" : "left";
      return { view: "front", action: "idle", facing: turned, x: Math.min(wall, Math.max(0, x)), age: 0, hold: range([3, 6], rand) };
    }
    if (b.hold > 1) return { ...b, x, age, hold: b.hold - 1 };
    return choose({ ...b, x }, mood, rand, wall);
  }

  if (b.hold > 1) return { ...b, age, hold: b.hold - 1 };
  return choose(b, mood, rand, wall);
}

/** Time to choose what to do next. */
function choose(b: Behavior, mood: PetMood, rand: Rand, wall: number): Behavior {
  const next = pick(mood, rand);
  let facing = b.facing;
  // Walking starts away from a wall the pet is near, otherwise either way.
  if (next.action === "walk") facing = b.x <= 2 ? "right" : b.x >= wall - 2 ? "left" : rand() < 0.5 ? "left" : "right";
  return { view: next.view, action: next.action, facing, x: Math.min(b.x, wall), age: 0, hold: range(next.ticks, rand) };
}
