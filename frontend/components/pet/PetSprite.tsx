import { useMemo } from "react";
import { View } from "react-native";

import type { PetMood } from "../../lib/petStatus";
import type { HatId } from "../../features/pets/sprites/hats";
import { petRows, recipeFor, type PetRecipe } from "../../features/pets/sprites/petLook";
import type { PixelColors } from "../../features/pets/sprites/photoColors";
import { SCENE_SIZE, type Pose } from "../../features/pets/sprites/scene";
import type { Species } from "../../types/db";
import { PixelGrid } from "./PixelGrid";

type Props = {
  species: Species;
  /** `pets.profile.coat`; anything unknown falls back to a generic dog or cat. */
  coat?: unknown;
  /** `pets.breed` as typed; picks the head shape (floppy, pointy, fluffy, flat; short or long for cats). */
  breed?: string | null;
  mood: PetMood;
  /** Colors picked from the pet's photo (`pets.profile.pixel_colors`); they win over the coat. */
  colors?: PixelColors | null;
  /** `pets.weight_kg`: picks the build (slim, regular, chonky) against the breed's usual weight. */
  weightKg?: number | null;
  /** The look the owner made (`pets.profile.pixel_look`); it wins over breed, coat, colors and weight. */
  look?: PetRecipe | null;
  /** Which way the pet looks and what it is doing; the default is looking at you. */
  pose?: Pose;
  /** Side poses face this way (the picture is mirrored for left). */
  facing?: "left" | "right";
  /** A hat on its head. */
  hat?: HatId | null;
  /** Screen px of one sprite pixel (the pet is 32 of them wide). */
  pixel?: number;
  testID?: string;
};

const FRONT: Pose = { view: "front", action: "idle", frame: 0 };

/** The 8-bit pet (11.12, Pet maker): the whole animal in one pose, drawn by `petgen.js` from the pet's look. */
export function PetSprite({ species, coat, breed, mood, colors, weightKg, look, pose = FRONT, facing = "right", hat = null, pixel = 8, testID }: Props) {
  const size = SCENE_SIZE * pixel;
  const { view, action, frame, progress } = pose;
  const recipe = useMemo(() => recipeFor({ species, breed, coat, colors, weightKg, look }), [species, breed, coat, colors, weightKg, look]);
  const pixels = useMemo(
    () => petRows(recipe, { mood, pose: { view, action, frame, progress }, facing, hat }),
    [recipe, mood, view, action, frame, progress, facing, hat],
  );

  return (
    <View accessibilityLabel={`${species} feeling ${mood}`} accessibilityRole="image" style={{ width: size, height: size }} testID={testID}>
      <PixelGrid pixels={pixels} pixel={pixel} />
    </View>
  );
}
