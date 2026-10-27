import { useMemo } from "react";
import { View } from "react-native";

import { FACE_SIZE, faceRows, type FaceMood } from "../../features/pets/sprites/moodFaces";
import { recipeFor, type PetRecipe } from "../../features/pets/sprites/petLook";
import type { Species } from "../../types/db";
import { PixelGrid } from "./PixelGrid";

type Props = {
  pet: { name?: string | null; species: Species; breed?: string | null; look?: PetRecipe | null };
  mood: FaceMood;
  /** The word read out ("Max looks playful"); the face's own name when left out. */
  label?: string;
  /** Rounded down to whole pixels of the 24-pixel face, so use 24, 48, 72… */
  size: number;
  /** Inside a button that already names the mood: the face is decoration only. */
  decorative?: boolean;
  testID?: string;
};

/** The pet's tamagotchi face for a mood (brand logo files), in the head shape of its breed or saved look. */
export function PetMoodFace({ pet, mood, label, size, decorative, testID }: Props) {
  const { species, breed, look } = pet;
  const base = useMemo(() => recipeFor({ species, breed, look }).base, [species, breed, look]);
  const pixels = useMemo(() => faceRows(base, mood, species === "cat"), [base, mood, species]);
  const pixel = Math.max(1, Math.floor(size / FACE_SIZE));
  const side = pixel * FACE_SIZE;
  return (
    <View
      style={{ width: side, height: side }}
      {...(decorative
        ? { "aria-hidden": true, importantForAccessibility: "no-hide-descendants" as const }
        : { accessibilityRole: "image" as const, accessibilityLabel: `${pet.name ?? "Your pet"} looks ${(label ?? mood).toLowerCase()}` })}
      testID={testID}
    >
      <PixelGrid pixels={pixels} pixel={pixel} />
    </View>
  );
}
