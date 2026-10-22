import type { PetMood } from "../../../lib/petStatus";
import { isCoat, type Coat } from "../../ownerOnboarding/questions";
import type { Species } from "../../../types/db";
import { colorsPalette, type PixelColors } from "./photoColors";

/**
 * Placeholder pixel pets drawn in code (11.12). A sprite is a 16x16 grid of role letters; a coat colors the roles and
 * a mood adds a face on top, so every head shape gets all five moods. Shapes are written as their left half and
 * mirrored; the eyes sit on rows 7-8 and the mouth on each shape's `mouthRow`.
 *
 * Roles: o outline · b coat · d shade (ears) · l light (muzzle) · n nose · e eye · w eye shine · m mouth · t tongue · z sleep
 */
export const SPRITE_SIZE = 16;

const mirror = (half: string) => half + [...half].reverse().join("");

/** Head shapes (2026-10-21): the look follows the breed, the size follows the weight, the color follows the coat. */
export type DogShape = "floppy" | "pointy" | "fluffy" | "flat";
export type CatShape = "short" | "long";
export type Shape = DogShape | CatShape;

const SHAPE_HALVES: Record<Shape, { rows: string[]; mouthRow: number }> = {
  // Long ears hanging along the face (retrievers, beagles), and any dog we can't place.
  floppy: {
    mouthRow: 13,
    rows: [
      "........",
      "........",
      ".....ooo",
      "..ooobbb",
      ".oddobbb",
      ".oddbbbb",
      ".oddbbbb",
      ".oddbbbb",
      ".oddbbbb",
      "..oobbbb",
      "...obbbb",
      "...obbln",
      "...oblll",
      "....olll",
      ".....ooo",
      "........",
    ],
  },
  // Ears standing up (shepherds, huskies, corgis, chihuahuas).
  pointy: {
    mouthRow: 13,
    rows: [
      "........",
      ".o......",
      ".oo.....",
      ".odo....",
      ".oddoooo",
      ".obbbbbb",
      ".obbbbbb",
      "obbbbbbb",
      "obbbbbbb",
      "obbbbbbb",
      ".obbbbbb",
      "..obbbln",
      "...oblll",
      "....olll",
      ".....ooo",
      "........",
    ],
  },
  // A round puff with curls, no ears showing (poodles, maltese, shih tzus).
  fluffy: {
    mouthRow: 13,
    rows: [
      "........",
      "....oooo",
      "..oobbbb",
      ".obbbbbb",
      "obbdbbbb",
      "obdbbbbb",
      "obbbbbbb",
      "odbbbbbb",
      "obbbbbbb",
      "odbbbbbb",
      "obbbbbbb",
      ".obbbbln",
      ".obbblll",
      "..obblll",
      "...ooooo",
      "........",
    ],
  },
  // A wide face, small ears and a short muzzle (bulldogs, pugs).
  flat: {
    mouthRow: 12,
    rows: [
      "........",
      "........",
      "........",
      ".oo.....",
      "oddooooo",
      "odbbbbbb",
      "obbbbbbb",
      "obbbbbbb",
      "obbbbbbb",
      "obbbbbbb",
      "obbbbbln",
      "obbbllll",
      ".obbllll",
      "..oollll",
      "....oooo",
      "........",
    ],
  },
  short: {
    mouthRow: 12,
    rows: [
      "........",
      ".o......",
      ".oo.....",
      ".odoo...",
      ".oddboo.",
      ".odbbbbo",
      ".obbbbbb",
      ".obbbbbb",
      ".obbbbbb",
      ".obbbbbb",
      "..obbbbb",
      "..obbbln",
      "...obbll",
      "....oooo",
      "........",
      "........",
    ],
  },
  // Ear tufts and a fur ruff (maine coons, ragdolls, long hair).
  long: {
    mouthRow: 12,
    rows: [
      "o.......",
      ".o......",
      ".oo.....",
      ".odoo...",
      ".oddboo.",
      ".odbbbbo",
      ".obbbbbb",
      "obbbbbbb",
      "obbbbbbb",
      "odbbbbbb",
      "obdbbbbb",
      "odbbbbln",
      ".obdbbll",
      "..odbooo",
      "...oo...",
      "........",
    ],
  },
};

export const SHAPES: Record<Species, Shape[]> = { dog: ["floppy", "pointy", "fluffy", "flat"], cat: ["short", "long"] };
const DEFAULT_SHAPE: Record<Species, Shape> = { dog: "floppy", cat: "short" };

/** Breed words (the reviewed breeds in backend/app/data/breed_needs.json and a few more) to a head shape. */
const BREED_SHAPES: { shape: Shape; words: string[] }[] = [
  { shape: "pointy", words: ["shepherd", "husky", "corgi", "chihuahua", "malamute", "shiba", "akita", "samoyed", "spitz"] },
  { shape: "fluffy", words: ["poodle", "maltese", "shih tzu", "pomeranian", "yorkshire", "yorkie", "bichon", "doodle", "havanese"] },
  { shape: "flat", words: ["bulldog", "boston terrier", "pug", "boxer"] },
  { shape: "long", words: ["longhair", "long hair", "maine coon", "ragdoll", "persian", "norwegian", "siberian cat"] },
];

/** The head shape for a breed as the owner typed it; an unknown or missing breed is a plain dog or cat. */
export function petShape(species: Species, breed: string | null | undefined): Shape {
  const text = (breed ?? "").toLowerCase();
  // "Australian Shepherd" hangs its ears: checked before the "shepherd" word.
  if (species === "dog" && text.includes("australian shepherd")) return "floppy";
  const found = BREED_SHAPES.find((b) => SHAPES[species].includes(b.shape) && b.words.some((w) => text.includes(w)));
  return found?.shape ?? DEFAULT_SHAPE[species];
}

export type PetSize = "S" | "M" | "L";

/** Dogs by weight: S under 10 kg, M to 25 kg, L above; no weight is M. Cats are one size. */
export function petSize(species: Species, weightKg: number | null | undefined): PetSize {
  if (species === "cat" || weightKg == null || !(weightKg > 0)) return "M";
  return weightKg < 10 ? "S" : weightKg <= 25 ? "M" : "L";
}

/** How much of the pet room a size fills. */
export const SIZE_SCALE: Record<PetSize, number> = { S: 0.7, M: 0.85, L: 1 };

const BODY: Record<Shape, { rows: string[]; mouthRow: number }> = Object.fromEntries(
  Object.entries(SHAPE_HALVES).map(([shape, { rows, mouthRow }]) => [shape, { rows: rows.map(mirror), mouthRow }]),
) as Record<Shape, { rows: string[]; mouthRow: number }>;

const EYE_ROWS = [7, 8];
const BLANK_HALF = "........";

/** Eyes (rows 7-8) and mouth, as left halves; sleepy also floats a "Z" at the bottom right. */
const FACE: Record<PetMood, { eyes: [string, string]; mouth: string; zzz?: boolean }> = {
  excited: { eyes: ["....we..", "....ee.."], mouth: "......mt" },
  calm: { eyes: [".....e..", ".....e.."], mouth: "......mm" },
  tired: { eyes: ["....dd..", "....ee.."], mouth: ".......m" },
  hungry: { eyes: ["....we..", "....ee.."], mouth: ".....m.m" },
  sleepy: { eyes: [BLANK_HALF, "....ee.."], mouth: BLANK_HALF, zzz: true },
};

const ZZZ_ROWS: Record<number, string> = { 12: ".............zzz", 13: "..............z.", 14: ".............zzz" };

export const COAT_PALETTES: Record<Coat, { base: string; shade: string; light: string; outline: string; nose: string; eye: string }> = {
  white: { base: "#F4F1EC", shade: "#D8D2C8", light: "#FFFFFF", outline: "#6B665E", nose: "#3A3A3A", eye: "#1A1A1A" },
  cream: { base: "#F1DDB3", shade: "#D9BE88", light: "#FFF3D6", outline: "#7A5F34", nose: "#3A3A3A", eye: "#1A1A1A" },
  golden: { base: "#D9A441", shade: "#B07A22", light: "#F0CE85", outline: "#6B4410", nose: "#2B2B2B", eye: "#1A1A1A" },
  orange: { base: "#E58A3C", shade: "#BF6320", light: "#F6BE88", outline: "#7A3A0C", nose: "#2B2B2B", eye: "#1A1A1A" },
  brown: { base: "#8A5A3B", shade: "#62391F", light: "#B88A66", outline: "#3A2010", nose: "#1F1F1F", eye: "#1A1A1A" },
  black: { base: "#3B3B40", shade: "#1F1F23", light: "#6A6A72", outline: "#0B0B0D", nose: "#8C8C94", eye: "#F2E6C2" },
  gray: { base: "#A0A4AA", shade: "#7A7E85", light: "#CDD0D4", outline: "#4A4D52", nose: "#2B2B2B", eye: "#1A1A1A" },
  mixed: { base: "#C49A6C", shade: "#7B5B3E", light: "#EEDFC9", outline: "#4A3320", nose: "#2B2B2B", eye: "#1A1A1A" },
};

/** What an unknown or missing coat falls back to: a generic dog or cat. */
export const DEFAULT_COAT: Record<Species, Coat> = { dog: "golden", cat: "orange" };

const FIXED = { shine: "#FFFFFF", mouth: "#7A2E2E", tongue: "#F28B9B", zzz: "#7C83B8" };

export function resolveCoat(species: Species, coat: unknown): Coat {
  return isCoat(coat) ? coat : DEFAULT_COAT[species];
}

/** The key of one look, e.g. `dog_floppy_golden_calm`; Muk's PNGs are named the same way. */
export function spriteKey(species: Species, coat: unknown, mood: PetMood, shape: Shape = DEFAULT_SHAPE[species]): string {
  return `${species}_${shape}_${resolveCoat(species, coat)}_${mood}`;
}

/** The sprite as rows of CSS colors, `null` = transparent. */
export function spritePixels(
  species: Species,
  coat: unknown,
  mood: PetMood,
  shape: Shape = DEFAULT_SHAPE[species],
  colors?: PixelColors | null,
): (string | null)[][] {
  // Colors picked from a photo win over the coat the owner chose.
  const palette = colors ? colorsPalette(colors) : COAT_PALETTES[resolveCoat(species, coat)];
  const { rows, mouthRow } = BODY[SHAPES[species].includes(shape) ? shape : DEFAULT_SHAPE[species]];
  const face = FACE[mood];
  const overlay: Record<number, string> = {
    [EYE_ROWS[0]]: mirror(face.eyes[0]),
    [EYE_ROWS[1]]: mirror(face.eyes[1]),
    [mouthRow]: mirror(face.mouth),
  };
  const roleColors: Record<string, string> = {
    o: palette.outline,
    b: palette.base,
    d: palette.shade,
    l: palette.light,
    n: palette.nose,
    e: palette.eye,
    w: FIXED.shine,
    m: FIXED.mouth,
    t: FIXED.tongue,
    z: FIXED.zzz,
  };
  return rows.map((row, y) => {
    const over = overlay[y] ?? "";
    const zzz = face.zzz ? (ZZZ_ROWS[y] ?? "") : "";
    return [...row].map((role, x) => {
      const top = zzz[x] && zzz[x] !== "." ? zzz[x] : over[x] && over[x] !== "." ? over[x] : role;
      return top === "." ? null : roleColors[top];
    });
  });
}
