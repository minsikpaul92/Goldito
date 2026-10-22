import type { PetMood } from "../../../lib/petStatus";
import type { Shape } from "./sprites";

/**
 * Pet heads in profile, facing right, 16x16 grids of role letters (same roles as the front heads in `sprites.ts`).
 * Left-facing is the whole picture mirrored. The face (eye, mouth) is drawn on top per mood, see `SIDE_FACE`.
 */
export const SIDE_HEADS: Record<Shape, string[]> = {
  // Long ear hanging along the cheek.
  floppy: [
    "................",
    "................",
    ".....oooooo.....",
    "...ooobbbbboo...",
    "..obbbbbbbbbbo..",
    "..obddbbbbbbbbo.",
    ".obddbbbbbbbbbbo",
    ".obddbbbbbbbbbbo",
    ".obddbbbbbbbblo.",
    ".obddbbbbbbblllo",
    "..obdbbbbbblllno",
    "..oobbbbbbbllllo",
    "...obbbbbbbbllo.",
    "....oooooooooo..",
    "................",
    "................",
  ],
  // Ear standing up.
  pointy: [
    "................",
    "....o...........",
    "...oo...........",
    "...odo.oooo.....",
    "...oddooobbo....",
    "..obbbbbbbbbo...",
    "..obbbbbbbbbbo..",
    ".obbbbbbbbbbbbo.",
    ".obbbbbbbbbblbo.",
    ".obbbbbbbbblllno",
    "..obbbbbbbblllo.",
    "..oobbbbbbbbllo.",
    "...obbbbbbbbbo..",
    "....ooooooooo...",
    "................",
    "................",
  ],
  // A round puff, no ear showing, a short muzzle.
  fluffy: [
    "................",
    "....ooooooo.....",
    "..oobbbbbbboo...",
    ".obbbbbbbbbbbo..",
    ".obbdbbbbbbbbbo.",
    "obbdbbbbbbbbbbbo",
    "obdbbbbbbbbbbbbo",
    "obbbbbbbbbbbblno",
    "obdbbbbbbbbblllo",
    "obbbbbbbbbbbllo.",
    ".obdbbbbbbbbbbo.",
    ".obbbbbbbbbbbo..",
    "..obbbbbbbbbo...",
    "...ooooooooo....",
    "................",
    "................",
  ],
  // A wide face, a small folded ear and a very short muzzle.
  flat: [
    "................",
    "................",
    "................",
    "...oooo.........",
    "..oddbooooo.....",
    "..odbbbbbbbbo...",
    ".obbbbbbbbbbbo..",
    ".obbbbbbbbbbbbo.",
    ".obbbbbbbbbbbln.",
    ".obbbbbbbbbbllo.",
    ".obbbbbbbbbblo..",
    "..obbbbbbbbbo...",
    "...oobbbbbbo....",
    ".....ooooooo....",
    "................",
    "................",
  ],
  short: [
    "................",
    "....o...o.......",
    "....oo..oo......",
    "....odooddo.....",
    "....oddbbddo....",
    "...obbbbbbbbo...",
    "..obbbbbbbbbbo..",
    "..obbbbbbbbbbbo.",
    "..obbbbbbbbbbbo.",
    "..obbbbbbbbblno.",
    "...obbbbbbbbllo.",
    "...oobbbbbbbbo..",
    ".....oooooooo...",
    "................",
    "................",
    "................",
  ],
  // Ear tufts and a fur ruff under the chin.
  long: [
    "................",
    "....o...o.......",
    "....oo..oo......",
    "....odooddo.....",
    "....oddbbddo....",
    "...obbbbbbbbo...",
    "..obbbbbbbbbbo..",
    "..obbbbbbbbbbbo.",
    ".obbbbbbbbbbbbo.",
    ".obdbbbbbbbblno.",
    ".obbdbbbbbbbllo.",
    ".obdbbdbbbbbbo..",
    "..obbbdbbbbbo...",
    "...obdbbdbbo....",
    "....ooooooo.....",
    "................",
  ],
};

type Pt = [number, number, string];

/** Where the eye and the mouth sit on each side head. */
const POS: Record<Shape, { eye: [number, number]; mouth: [number, number] }> = {
  floppy: { eye: [9, 6], mouth: [11, 11] },
  pointy: { eye: [9, 7], mouth: [11, 10] },
  fluffy: { eye: [10, 6], mouth: [11, 9] },
  flat: { eye: [9, 7], mouth: [10, 10] },
  short: { eye: [9, 7], mouth: [10, 10] },
  long: { eye: [9, 7], mouth: [10, 10] },
};

/** The face in profile for one mood: pixels (x, y, role) on top of a side head. A "Z" for sleepy is added by the scene. */
export function sideFace(shape: Shape, mood: PetMood): Pt[] {
  const { eye: [ex, ey], mouth: [mx, my] } = POS[shape];
  switch (mood) {
    case "excited":
      return [[ex, ey, "w"], [ex, ey + 1, "e"], [mx, my, "m"], [mx + 1, my, "m"], [mx, my + 1, "t"]];
    case "calm":
      return [[ex, ey, "e"], [ex, ey + 1, "e"], [mx, my, "m"], [mx + 1, my, "m"]];
    case "tired":
      return [[ex, ey, "d"], [ex, ey + 1, "e"], [mx + 1, my, "m"]];
    case "hungry":
      return [[ex, ey, "w"], [ex, ey + 1, "e"], [mx, my, "m"], [mx + 2, my, "m"]];
    case "sleepy":
      return [[ex - 1, ey + 1, "e"], [ex, ey + 1, "e"]];
  }
}
