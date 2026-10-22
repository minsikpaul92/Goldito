import { useMemo } from "react";
import { StyleSheet, View } from "react-native";

import type { PetMood } from "../../lib/petStatus";
import type { HatId } from "../../features/pets/sprites/hats";
import type { PixelColors } from "../../features/pets/sprites/photoColors";
import { SCENE_SIZE, spriteScene, type Pose } from "../../features/pets/sprites/scene";
import { petShape } from "../../features/pets/sprites/sprites";
import type { Species } from "../../types/db";

type Props = {
  species: Species;
  /** `pets.profile.coat`; anything unknown falls back to a generic dog or cat. */
  coat?: unknown;
  /** `pets.breed` as typed; picks the head shape (floppy, pointy, fluffy, flat; short or long for cats). */
  breed?: string | null;
  mood: PetMood;
  /** Colors picked from the pet's photo (`pets.profile.pixel_colors`); they win over the coat. */
  colors?: PixelColors | null;
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

/**
 * The 8-bit pet (11.12): the whole animal in one pose, drawn from role-letter layers (`scene.ts`). Pixels of one color
 * in a row are merged into one View, so a pose is a couple of hundred Views, not 1024.
 */
export function PetSprite({ species, coat, breed, mood, colors, pose = FRONT, facing = "right", hat = null, pixel = 8, testID }: Props) {
  const size = SCENE_SIZE * pixel;
  const shape = petShape(species, breed);
  const { view, action, frame } = pose;
  const rows = useMemo(
    () => runs(spriteScene({ species, coat, shape, mood, colors, pose: { view, action, frame }, facing, hat })),
    [species, coat, shape, mood, colors, view, action, frame, facing, hat],
  );

  return (
    <View accessibilityLabel={`${species} feeling ${mood}`} accessibilityRole="image" style={{ width: size, height: size }} testID={testID}>
      {rows.map((row, y) => (
        <View key={y} style={styles.row}>
          {row.map((run, i) => (
            <View key={i} style={{ width: run.length * pixel, height: pixel, backgroundColor: run.color ?? "transparent" }} />
          ))}
        </View>
      ))}
    </View>
  );
}

type Run = { color: string | null; length: number };

/** Merge neighbours of the same color: [a, a, b] -> [{a, 2}, {b, 1}]. */
function runs(pixels: (string | null)[][]): Run[][] {
  return pixels.map((row) => {
    const out: Run[] = [];
    for (const color of row) {
      const last = out[out.length - 1];
      if (last && last.color === color) last.length += 1;
      else out.push({ color, length: 1 });
    }
    return out;
  });
}

const styles = StyleSheet.create({
  row: { flexDirection: "row" },
});
