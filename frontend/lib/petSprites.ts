import type { ImageSourcePropType } from "react-native";

import type { Pet } from "../types/db";

/**
 * Pixel pet presets for the Home Tamagotchi (#184, 11.12). Muk's hand-drawn heads, one file per
 * `species-coat-mood` key in `assets/pixel-pets/`. Each file is a 2-frame idle strip: two 24 × 24 cells
 * drawn at 8× (384 × 192 px, transparent), shown one frame at a time every FRAME.ms.
 * Source and rebuild: design/pixel-pets/build.py in the design worktree.
 */
export const PET_MOODS = ["excited", "calm", "tired", "hungry", "sleepy"] as const;
export type PetMood = (typeof PET_MOODS)[number];

export const PET_COATS = { dog: ["white", "golden"], cat: ["orange", "tuxedo"] } as const;
export type DogCoat = (typeof PET_COATS.dog)[number];
export type CatCoat = (typeof PET_COATS.cat)[number];
export type PetSpriteKey = `dog-${DogCoat}-${PetMood}` | `cat-${CatCoat}-${PetMood}`;

/** One strip = FRAME.count cells side by side; each cell is FRAME.size px drawn at FRAME.scale. */
export const FRAME = { size: 24, scale: 8, count: 2, ms: 600 } as const;

export const PET_SPRITES: Record<PetSpriteKey, ImageSourcePropType> = {
  "dog-white-excited": require("../assets/pixel-pets/dog-white-excited.png"),
  "dog-white-calm": require("../assets/pixel-pets/dog-white-calm.png"),
  "dog-white-tired": require("../assets/pixel-pets/dog-white-tired.png"),
  "dog-white-hungry": require("../assets/pixel-pets/dog-white-hungry.png"),
  "dog-white-sleepy": require("../assets/pixel-pets/dog-white-sleepy.png"),
  "dog-golden-excited": require("../assets/pixel-pets/dog-golden-excited.png"),
  "dog-golden-calm": require("../assets/pixel-pets/dog-golden-calm.png"),
  "dog-golden-tired": require("../assets/pixel-pets/dog-golden-tired.png"),
  "dog-golden-hungry": require("../assets/pixel-pets/dog-golden-hungry.png"),
  "dog-golden-sleepy": require("../assets/pixel-pets/dog-golden-sleepy.png"),
  "cat-orange-excited": require("../assets/pixel-pets/cat-orange-excited.png"),
  "cat-orange-calm": require("../assets/pixel-pets/cat-orange-calm.png"),
  "cat-orange-tired": require("../assets/pixel-pets/cat-orange-tired.png"),
  "cat-orange-hungry": require("../assets/pixel-pets/cat-orange-hungry.png"),
  "cat-orange-sleepy": require("../assets/pixel-pets/cat-orange-sleepy.png"),
  "cat-tuxedo-excited": require("../assets/pixel-pets/cat-tuxedo-excited.png"),
  "cat-tuxedo-calm": require("../assets/pixel-pets/cat-tuxedo-calm.png"),
  "cat-tuxedo-tired": require("../assets/pixel-pets/cat-tuxedo-tired.png"),
  "cat-tuxedo-hungry": require("../assets/pixel-pets/cat-tuxedo-hungry.png"),
  "cat-tuxedo-sleepy": require("../assets/pixel-pets/cat-tuxedo-sleepy.png"),
};

// Pets have no coat field yet, so the breed text picks the closest preset; anything else gets the default coat.
const WHITE_DOGS = /maltese|maltipoo|bichon|poodle|samoyed|westie|white|coton|havanese|pomeranian/i;
const TUXEDO_CATS = /tuxedo|black|bombay/i;

export function petCoat(pet: Pick<Pet, "species" | "breed">): DogCoat | CatCoat {
  const breed = pet.breed ?? "";
  if (pet.species === "dog") return WHITE_DOGS.test(breed) ? "white" : "golden";
  return TUXEDO_CATS.test(breed) ? "tuxedo" : "orange";
}

export function petSpriteKey(pet: Pick<Pet, "species" | "breed">, mood: PetMood): PetSpriteKey {
  return `${pet.species}-${petCoat(pet)}-${mood}` as PetSpriteKey;
}

export function petSprite(pet: Pick<Pet, "species" | "breed">, mood: PetMood): ImageSourcePropType {
  return PET_SPRITES[petSpriteKey(pet, mood)];
}
