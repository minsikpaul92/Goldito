import { useEffect, useMemo, useState } from "react";
import { View } from "react-native";

import { petRows, recipeFor } from "../../features/pets/sprites/petLook";
import { SCENE_SIZE } from "../../features/pets/sprites/scene";
import type { Species } from "../../types/db";
import { PixelGrid } from "../pet/PixelGrid";

type Props = {
  species: Species;
  breed: string;
  coat: string;
  weightKg: number | null;
  /** Called once the pet is drawn. */
  onDone: () => void;
  testID?: string;
};

const PIXEL = 9;
const ROWS_PER_TICK = 2;
const TICK_MS = 60;
const HOP_MS = 450;

/** The 8-bit pet of sign-up: drawn row by row from the top, then it idles and hops. Mount it again to draw it again. */
export function PetReveal({ species, breed, coat, weightKg, onDone, testID }: Props) {
  const recipe = useMemo(() => recipeFor({ species, breed, coat, weightKg }), [species, breed, coat, weightKg]);
  const [drawn, setDrawn] = useState(0);
  const [beat, setBeat] = useState(0);
  const done = drawn >= SCENE_SIZE;

  useEffect(() => {
    if (done) return;
    const t = setInterval(() => setDrawn((n) => n + ROWS_PER_TICK), TICK_MS);
    return () => clearInterval(t);
  }, [done]);
  useEffect(() => {
    if (!done) return;
    onDone();
    const t = setInterval(() => setBeat((n) => n + 1), HOP_MS);
    return () => clearInterval(t);
    // onDone only flips a flag in the parent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done]);

  const frame = useMemo(
    () => petRows(recipe, { mood: done ? "excited" : "calm", pose: { view: "front", action: "idle", frame: beat % 2 } }),
    [recipe, done, beat],
  );
  const pixels = useMemo(() => frame.map((row, y) => (y < drawn ? row : row.map(() => null))), [frame, drawn]);

  return (
    <View
      accessibilityRole="image"
      accessibilityLabel={`${species} in 8-bit, build ${recipe.build ?? 0}, coat ${recipe.colors?.coat ?? "default"}`}
      style={{ width: SCENE_SIZE * PIXEL, height: SCENE_SIZE * PIXEL + PIXEL, justifyContent: "flex-end" }}
      testID={testID}
    >
      <View style={{ transform: [{ translateY: done && beat % 2 === 1 ? -PIXEL : 0 }] }}>
        <PixelGrid pixels={pixels} pixel={PIXEL} />
      </View>
    </View>
  );
}
