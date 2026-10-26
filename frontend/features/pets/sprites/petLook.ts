import type { PetMood } from "../../../lib/petStatus";
import type { Species } from "../../../types/db";
import { isCoat } from "../../ownerOnboarding/questions";
import { HATS, type HatId } from "./hats";
import PetGen from "./petgen";
import data from "./petgen-data.json";
import { PET_PRESETS, type PetPreset } from "./petPresets";
import type { PixelColors } from "./photoColors";
import { FIXED, normalizePose, type Pose } from "./scene";
import { COAT_PALETTES } from "./sprites";

/**
 * The pet's look (Pet maker): a recipe that `petgen.js` draws in every pose. A saved one lives in
 * `pets.profile.pixel_look`; without it the look comes from what we know (breed, coat or photo colors, weight).
 * The same generator and breeds as the Pet maker page on the design site.
 */
export type PetRecipe = {
  base: string;
  ears?: string;
  earType?: "up" | "floppy";
  cheeks?: "regular" | "ruff";
  nose?: string;
  coat?: "smooth" | "fluffy" | "long";
  face?: string[];
  body?: string[];
  eyes?: string;
  chest?: string;
  paws?: string;
  tail?: string;
  plain?: boolean;
  build?: number;
  legs?: number;
  length?: number;
  mood?: string;
  colors?: Partial<Record<ColorKey, string>>;
};
export type ColorKey = "coat" | "light" | "muzzle" | "ear" | "white" | "dark" | "tan" | "patch" | "patch2" | "stripe" | "spot" | "points" | "mark" | "nose" | "outline";

type Base = { label: string; cat: boolean; kg: number; body: [number, number]; head: string; keys: Record<string, string> };
/** The 17 head shapes (the Pet options pets) the recipes start from. */
export const PET_BASES = (data as unknown as { bases: Record<string, Base> }).bases;

let ready = false;
function gen() {
  if (!ready) {
    PetGen.init(data);
    ready = true;
  }
  return PetGen;
}

const KEYS = ["base", "ears", "earType", "cheeks", "nose", "coat", "face", "body", "eyes", "chest", "paws", "tail", "plain", "build", "legs", "length", "colors"];
const HEX = /^#[0-9a-f]{6}$/i;

/** A saved look (`pets.profile.pixel_look`), or null when it is missing or not one we can draw. */
export function asPetRecipe(value: unknown): PetRecipe | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (typeof v.base !== "string" || !Object.hasOwn(PET_BASES, v.base)) return null;
  const out: Record<string, unknown> = {};
  for (const k of KEYS) if (v[k] !== undefined) out[k] = v[k];
  if (out.colors && typeof out.colors === "object") {
    out.colors = Object.fromEntries(Object.entries(out.colors as Record<string, unknown>).filter(([, c]) => typeof c === "string" && HEX.test(c)));
  }
  return out as PetRecipe;
}

const ALIASES: Record<string, string> = {
  "black lab": "Labrador (black)", "chocolate lab": "Labrador (chocolate)", "yellow lab": "Labrador (yellow)",
  golden: "Golden retriever", retriever: "Golden retriever", lab: "Labrador (yellow)", poodle: "Poodle (apricot)", doodle: "Goldendoodle",
  shepherd: "German shepherd", aussie: "Australian shepherd (merle)", yorkie: "Yorkshire terrier", frenchie: "French bulldog", pit: "Pit bull (blue)",
  "korean short": "Orange tabby", shorthair: "Orange tabby", "short hair": "Orange tabby", tabby: "Orange tabby",
};

/** The breed preset a breed text names ("Golden Retriever mix" -> Golden retriever), or null. */
export function presetFor(species: Species, breed: string | null | undefined): PetPreset | null {
  const text = (breed ?? "").toLowerCase();
  if (!text.trim()) return null;
  const cat = species === "cat";
  const mine = PET_PRESETS.filter((p) => PET_BASES[p.base].cat === cat);
  // The full name ("labrador (black)"), then the name without its note ("labrador"), the longest winning, then everyday names.
  const full = mine.find((p) => text.includes(p.name.toLowerCase()));
  if (full) return full;
  const named = mine
    .map((p) => ({ p, key: p.name.toLowerCase().replace(/\s*\(.*\)/, "") }))
    .filter(({ key }) => text.includes(key))
    .sort((a, b) => b.key.length - a.key.length)[0];
  if (named) return named.p;
  const alias = Object.entries(ALIASES).sort((x, y) => y[0].length - x[0].length).find(([word]) => text.includes(word));
  return (alias && mine.find((p) => p.name === alias[1])) || null;
}

/** The pet's recipe: the saved look, or one built from its breed, coat or photo colors and weight. */
export function recipeFor(pet: { species: Species; breed?: string | null; coat?: unknown; colors?: PixelColors | null; weightKg?: number | null; look?: PetRecipe | null }): PetRecipe {
  const cat = pet.species === "cat";
  if (pet.look && PET_BASES[pet.look.base]?.cat === cat) return pet.look;
  const { name: _name, ...preset } = presetFor(pet.species, pet.breed) ?? { name: "", base: cat ? "tabby" : "dog" };
  const recipe: PetRecipe = { ...preset, colors: { ...(preset.colors ?? {}) } };
  const paint = pet.colors ?? (isCoat(pet.coat) ? COAT_PALETTES[pet.coat] : null);
  if (paint) {
    const outline = PetGen.rgb2hex(PetGen.hex2rgb(paint.shade).map((v) => v * 0.45));
    recipe.colors = { ...recipe.colors, coat: paint.base, light: paint.light, ear: paint.shade, outline };
  }
  const kg = Number(pet.weightKg);
  if (kg > 0) {
    const usual = PET_BASES[recipe.base].kg;
    recipe.build = kg < usual * 0.85 ? -1 : kg > usual * 1.2 ? 1 : 0;
  }
  return recipe;
}

/** The app's moods as the generator's expressions. */
const MOOD: Record<PetMood, string> = { calm: "idle", excited: "excited", tired: "calm", hungry: "teary", sleepy: "sleep" };

/** One pose of the pet as rows of CSS colors (`null` = transparent), with its hat; `facing: "left"` mirrors it. */
export function petRows(recipe: PetRecipe, opts: { mood: PetMood; pose: Pose; facing?: "left" | "right"; hat?: HatId | null }): (string | null)[][] {
  const pose = normalizePose(opts.pose);
  const g = gen();
  const r = { ...recipe, mood: MOOD[opts.mood] };
  const grid = g.frame(r, pose.view, pose.action, pose.frame);
  // The app's own colors for the sleep Z and the food bowl, so they match the rest of the room.
  const palette = g.palette(r);
  palette.pal.Z = g.hex2rgb(FIXED.z);
  palette.roles.R = g.hex2rgb(FIXED.R);
  palette.roles.r = palette.roles.R.map((v) => Math.round(v * 0.75));
  const px = g.pixels(grid, palette);
  const rows: (string | null)[][] = [];
  for (let y = 0; y < 32; y++) {
    const row: (string | null)[] = [];
    for (let x = 0; x < 32; x++) {
      const i = (y * 32 + x) * 4;
      row.push(px[i + 3] ? g.rgb2hex([px[i], px[i + 1], px[i + 2]]) : null);
    }
    rows.push(row);
  }
  // The hat covers the top of the head and ends on the row above the eyes, centred on the crown.
  if (opts.hat && grid.head) {
    const art = HATS[opts.hat].views[pose.view];
    const { x: hx, y: hy, eyeRow, center } = grid.head;
    const x0 = Math.round(hx + center - art[0].length / 2);
    const y0 = hy + eyeRow - art.length;
    art.forEach((line, dy) =>
      [...line].forEach((role, dx) => {
        const x = x0 + dx;
        const y = y0 + dy;
        if (role !== "." && x >= 0 && y >= 0 && x < 32 && y < 32) rows[y][x] = FIXED[role] ?? null;
      }),
    );
  }
  return opts.facing === "left" ? rows.map((row) => row.reverse()) : rows;
}
