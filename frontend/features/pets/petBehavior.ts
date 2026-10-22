import type { PetMood } from "../../lib/petStatus";
import { POOP_SIZE, SCENE_SIZE, type Action, type Pose, type View } from "./sprites/scene";

/**
 * What the pet does in its room (11.12b): it walks left and right, stops, looks at you or away, turns around at the
 * walls and lies down to rest. The mood leans the choices: a sleepy pet lies down, a hungry or happy one keeps moving.
 * A pure step function, one tick at a time; `usePetBehavior` calls it on a timer.
 */
/** A poop on the floor: where (sprite pixels from the left wall) and how many ticks it has been there. */
export type Poop = { id: number; x: number; age: number };

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
  /** How many ticks the action was given in all (an eat or poop shows its progress). */
  span: number;
  /** What the pet left on the floor; the room clears each after a while. */
  poops: Poop[];
};

export const TICK_MS = 180;
/** Sprite pixels a walking pet covers in one tick. */
const SPEED = 1;
/** Ticks per animation frame while standing or lying (walking changes frame every tick). */
const SLOW_FRAME = 3;
/** An eat or a poop changes frame a little quicker. */
const BUSY_FRAME = 2;
/** How long an eat and a poop last, in ticks (about 3.6 and 2.5 seconds). */
const EAT_TICKS = 20;
const POOP_TICKS = 14;
/** The tick of a poop on which it drops, how long it stays (about 6 seconds), and the last ticks it blinks. */
const POOP_DROP_AT = 5;
const POOP_STAYS = 34;
const POOP_BLINK = 6;

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
  return { view: "front", action: "idle", facing: "right", x: 0, age: 0, hold: 8, span: 8, poops: [] };
}

/** The animation frame of the current action. */
export function behaviorFrame(b: Behavior): number {
  if (b.action === "walk") return b.age;
  return Math.floor(b.age / (b.action === "eat" || b.action === "poop" ? BUSY_FRAME : SLOW_FRAME));
}

/** The pose to draw: the view, the action, its frame and how far into an eat the pet is (the bowl empties). */
export function behaviorPose(b: Behavior): Pose {
  return { view: b.view, action: b.action, frame: behaviorFrame(b), progress: b.span > 0 ? Math.min(1, b.age / b.span) : 0 };
}

/** A poop is drawn blinking for its last ticks: this says whether it shows now. */
export function poopVisible(p: Poop): boolean {
  const left = POOP_STAYS - p.age;
  return left > POOP_BLINK || left % 2 === 0;
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
  const next = stepActions(b, mood, rand, maxX);
  // The floor: each poop gets older and is cleared after a while; a poop that was just dropped is added.
  const poops = b.poops.map((p) => ({ ...p, age: p.age + 1 })).filter((p) => p.age <= POOP_STAYS);
  if (next.action === "poop" && b.action === "poop" && next.age === POOP_DROP_AT) {
    // Behind the pet: its tail end is at the left when it faces right, at the right when it faces left.
    poops.push({ id: poops.reduce((m, p) => Math.max(m, p.id), 0) + 1, x: Math.max(0, Math.min(Math.max(0, maxX) + SCENE_SIZE - POOP_SIZE.w, next.x + (next.facing === "right" ? 0 : SCENE_SIZE - 7))), age: 0 });
  }
  return { ...next, poops };
}

/** The pet shows an eat or a poop at once, e.g. when the sitter just tapped Feed or Poop. A sleeping pet is left alone. */
export function triggerBehavior(b: Behavior, kind: "eat" | "poop", mood: PetMood): Behavior {
  if (mood === "sleepy" || b.action === "lie") return b;
  const span = kind === "eat" ? EAT_TICKS : POOP_TICKS;
  return { ...b, view: "side", action: kind, age: 0, hold: span, span };
}

/** The pet wakes up (the sitter tapped Awake): it gets up and looks at you before it carries on. */
export function wakeBehavior(b: Behavior): Behavior {
  if (b.action !== "lie") return b;
  return { ...b, view: "front", action: "idle", age: 0, hold: 5, span: 5 };
}

function stepActions(b: Behavior, mood: PetMood, rand: Rand, maxX: number): Behavior {
  const wall = Math.max(0, maxX);
  const age = b.age + 1;

  // A sleepy pet lies down at once; an excited or hungry one gets up.
  if (mood === "sleepy" && b.action !== "lie") {
    const hold = range([60, 120], rand);
    return { ...b, view: "side", action: "lie", age: 0, hold, span: hold, x: Math.min(b.x, wall) };
  }
  if (b.action === "lie" && (mood === "excited" || mood === "hungry")) {
    const hold = range([4, 8], rand);
    return { ...b, view: "front", action: "idle", age: 0, hold, span: hold };
  }

  if (b.action === "walk") {
    const x = b.x + (b.facing === "right" ? SPEED : -SPEED);
    if (x <= 0 || x >= wall) {
      // At a wall: look at you, then walk back the other way.
      const turned = x <= 0 ? "right" : "left";
      const hold = range([3, 6], rand);
      return { ...b, view: "front", action: "idle", facing: turned, x: Math.min(wall, Math.max(0, x)), age: 0, hold, span: hold };
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
  const hold = range(next.ticks, rand);
  return { ...b, view: next.view, action: next.action, facing, x: Math.min(b.x, wall), age: 0, hold, span: hold };
}
