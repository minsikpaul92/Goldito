import type { PetMood } from "../../../lib/petStatus";
import type { Species } from "../../../types/db";
import { colorsPalette, type PixelColors } from "./photoColors";
import { HATS, type HatId } from "./hats";
import { sideFace, SIDE_HEADS } from "./sideHeads";
import { COAT_PALETTES, DEFAULT_SHAPE_OF, FRONT_HEAD_HALVES, FRONT_FACE, mirrorHalf, resolveCoat, SHAPES, type Shape } from "./sprites";

/**
 * The whole pet (11.12b): a 32x32 picture made of layers, drawn in code as a placeholder for Muk's art.
 * body (tail, far legs, torso, near legs) -> head (front, side or back) -> face -> hat.
 * Every layer is role letters; the coat colors the roles, so the pet keeps its coat or photo colors in every pose.
 *
 * Views: `front` looks at you, `side` faces right (left is the picture mirrored), `back` shows the pet from behind.
 * Actions: `idle` (2 frames), `walk` (4 frames, side only), `lie` (2 frames, side only, asleep).
 */
export const SCENE_SIZE = 32;

export type View = "front" | "side" | "back";
export type Action = "idle" | "walk" | "lie";
export type Pose = { view: View; action: Action; frame: number };

/** How many frames a pose has; a pose that does not exist falls back to idle. */
export function frameCount(view: View, action: Action): number {
  if (action === "walk" && view === "side") return 4;
  if (action === "lie" && view === "side") return 2;
  return 2;
}

/** The pose as it will be drawn: unknown combinations become idle, the frame wraps. */
export function normalizePose(p: Pose): Pose {
  const ok = (p.action === "walk" || p.action === "lie") && p.view === "side";
  const action: Action = ok ? p.action : "idle";
  const n = frameCount(p.view, action);
  return { view: p.view, action, frame: ((p.frame % n) + n) % n };
}

type Grid = string[][];

const blank = (): Grid => Array.from({ length: SCENE_SIZE }, () => Array<string>(SCENE_SIZE).fill("."));

function put(g: Grid, x: number, y: number, role: string) {
  if (x >= 0 && y >= 0 && x < SCENE_SIZE && y < SCENE_SIZE && role !== ".") g[y][x] = role;
}

function stamp(g: Grid, rows: string[], x: number, y: number) {
  rows.forEach((row, dy) => [...row].forEach((role, dx) => put(g, x + dx, y + dy, role)));
}

/** A filled box with an outline; `round` clips the four corners of the outline. */
function box(g: Grid, x: number, y: number, w: number, h: number, fill: string, round = true) {
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      const edge = dx === 0 || dy === 0 || dx === w - 1 || dy === h - 1;
      const corner = (dx === 0 || dx === w - 1) && (dy === 0 || dy === h - 1);
      if (round && corner) continue;
      put(g, x + dx, y + dy, edge ? "o" : fill);
    }
  }
}

// ----- tails (small stamps, drawn behind the torso) -----
const DOG_TAIL = ["..oo", ".obo", ".obo", "obbo", "obo."];
const CAT_TAIL = ["..oo", ".obo", ".obo", ".obo", "obbo", "obo.", "obo."];

// ----- heads: a front head is the shape's left half mirrored; a back head is the same without its face -----
function frontHead(shape: Shape): string[] {
  return FRONT_HEAD_HALVES[shape].rows.map(mirrorHalf);
}
function backHead(shape: Shape): string[] {
  return frontHead(shape).map((row) => row.replace(/[lnewmt]/g, "b"));
}

/** The first row of a head that has coat in it, and the middle column of that part of the skull. */
function crown(head: string[]): { row: number; center: number } {
  const row = head.findIndex((r) => r.includes("b"));
  const probe = head[Math.min(15, row + 2)];
  const first = [...probe].findIndex((c) => c !== ".");
  const last = probe.length - 1 - [...probe].reverse().findIndex((c) => c !== ".");
  return { row, center: (first + last) / 2 };
}

type Parts = { head: string[]; headX: number; headY: number; faceKind: "front" | "side" | "none" };

/** Draws the body for a pose and says where the head goes. */
function drawBody(g: Grid, species: Species, shape: Shape, pose: Pose): Parts {
  const { view, action, frame } = pose;
  const dog = species === "dog";
  // The head bobs one pixel on every other frame.
  const bob = action === "lie" ? 0 : frame % 2;

  if (view === "side" && action === "lie") {
    // Asleep on its belly: a low body, the head resting on its paws, one pixel of breathing.
    const breath = frame === 1 ? 1 : 0;
    stamp(g, dog ? DOG_TAIL : CAT_TAIL, 1, 21);
    box(g, 4, 22 - breath, 20, 8 + breath, "b");
    box(g, 5, 27, 6, 3, "d", false);
    box(g, 21, 27, 8, 3, "l", false);
    return { head: SIDE_HEADS[shape], headX: 14, headY: 14 - breath, faceKind: "side" };
  }

  if (view === "side") {
    const walking = action === "walk";
    // A trot: the near front leg and the far hind leg go together (pair A), the other two opposite (pair B). Each pair
    // swings front to back and is lifted for a frame while it moves forward again.
    const swing = walking ? [2, 0, -2, 0][frame] : 0;
    const legH = 5;
    const leg = (x: number, lifted: boolean, fill: string) => box(g, x, 26, 4, legH - (lifted ? 1 : 0), fill, false);
    const liftA = walking && frame === 1;
    const liftB = walking && frame === 3;
    // Far legs (drawn first, in shade): front is pair B, hind is pair A.
    leg(20 - swing, liftB, "d");
    leg(8 + swing, liftA, "d");
    stamp(g, dog ? DOG_TAIL : CAT_TAIL, 2, 14 + bob);
    box(g, 5, 18 + bob, 18, 9, "b");
    // Near legs: front is pair A, hind is pair B.
    leg(17 + swing, liftA, "b");
    leg(6 - swing, liftB, "b");
    return { head: SIDE_HEADS[shape], headX: 15, headY: 6 + bob, faceKind: "side" };
  }

  // Front and back: a torso and two chunky legs, the same from both sides except for the tail and the paws.
  const front = view === "front";
  if (!front) stamp(g, dog ? DOG_TAIL : CAT_TAIL, 22, 17 + bob);
  const wide = dog ? 14 : 12;
  box(g, 16 - wide / 2, 18, wide, 9, "b");
  // Two legs with a gap between them; from the front the paws show.
  const legW = dog ? 5 : 4;
  for (const x of [15 - legW, 17]) {
    box(g, x, 25, legW, 6, "b", false);
    if (front) for (let dx = 1; dx < legW - 1; dx++) put(g, x + dx, 29, "l");
  }
  return { head: front ? frontHead(shape) : backHead(shape), headX: 8, headY: 5 + bob, faceKind: front ? "front" : "none" };
}

type PaintFace = (g: Grid, x: number, y: number) => void;

function frontFace(mood: PetMood, shape: Shape): PaintFace {
  return (g, x, y) => {
    const face = FRONT_FACE[mood];
    const rows: Record<number, string> = {
      7: mirrorHalf(face.eyes[0]),
      8: mirrorHalf(face.eyes[1]),
      [FRONT_HEAD_HALVES[shape].mouthRow]: mirrorHalf(face.mouth),
    };
    Object.entries(rows).forEach(([row, text]) => [...text].forEach((role, dx) => put(g, x + dx, y + Number(row), role)));
  };
}

/** The roles of the scene as it is drawn: a 32x32 grid, `.` is empty. Facing left is the grid mirrored by `spriteScene`. */
export function sceneRoles(species: Species, shape: Shape, mood: PetMood, rawPose: Pose, hat: HatId | null): Grid {
  const pose = normalizePose(rawPose);
  const safeShape = SHAPES[species].includes(shape) ? shape : DEFAULT_SHAPE_OF[species];
  const g = blank();
  const parts = drawBody(g, species, safeShape, pose);
  stamp(g, parts.head, parts.headX, parts.headY);

  // The face: a lying pet is always asleep.
  const faceMood: PetMood = pose.action === "lie" ? "sleepy" : mood;
  if (parts.faceKind === "front") frontFace(faceMood, safeShape)(g, parts.headX, parts.headY);
  if (parts.faceKind === "side") {
    for (const [x, y, role] of sideFace(safeShape, faceMood)) put(g, parts.headX + x, parts.headY + y, role);
  }
  if (mood === "sleepy" || pose.action === "lie") {
    // A little "Z" above the pet's back.
    stamp(g, ["zzz", ".z.", "zzz"], 26, 3);
  }

  if (hat) {
    const art = HATS[hat].views[pose.view];
    const { row, center } = crown(parts.head);
    const x = Math.round(parts.headX + center - art[0].length / 2);
    const y = parts.headY + row + 1 - art.length;
    stamp(g, art, x, y);
  }
  return g;
}

const FIXED: Record<string, string> = {
  w: "#FFFFFF",
  m: "#7A2E2E",
  t: "#F28B9B",
  z: "#7C83B8",
  P: "#F28C28",
  p: "#C2611A",
  G: "#4C8C2B",
  K: "#3A1D0A",
  Y: "#FFD24A",
  W: "#2B2338",
  V: "#4B3A6B",
  B: "#C9A227",
};

/** The scene as rows of CSS colors, `null` = transparent. `facing: "left"` mirrors it. */
export function spriteScene(opts: {
  species: Species;
  coat?: unknown;
  shape: Shape;
  mood: PetMood;
  colors?: PixelColors | null;
  pose: Pose;
  facing?: "left" | "right";
  hat?: HatId | null;
}): (string | null)[][] {
  const { species, coat, shape, mood, colors, pose, facing = "right", hat = null } = opts;
  const palette = colors ? colorsPalette(colors) : COAT_PALETTES[resolveCoat(species, coat)];
  const coatColors: Record<string, string> = {
    o: palette.outline,
    b: palette.base,
    d: palette.shade,
    l: palette.light,
    n: palette.nose,
    e: palette.eye,
  };
  const roles = sceneRoles(species, shape, mood, pose, hat);
  return roles.map((row) => {
    const out = row.map((role) => (role === "." ? null : coatColors[role] ?? FIXED[role] ?? null));
    return facing === "left" ? out.reverse() : out;
  });
}
