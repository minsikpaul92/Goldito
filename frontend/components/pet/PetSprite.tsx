import { useEffect, useMemo, useRef } from "react";
import { Animated, Easing, Image, StyleSheet, View } from "react-native";

import type { PetMood } from "../../lib/petStatus";
import { PIXEL_PNGS } from "../../features/pets/sprites/pngs";
import { headPixels, type PixelHead } from "../../features/pets/sprites/pixelize";
import { SPRITE_SIZE, spriteKey, spritePixels, withZzz } from "../../features/pets/sprites/sprites";
import type { Species } from "../../types/db";

type Props = {
  species: Species;
  /** `pets.profile.coat`; anything unknown falls back to a generic dog or cat. */
  coat?: unknown;
  mood: PetMood;
  /** A head made from the pet's photo (`pixelize.ts`); drawn instead of the preset. No mood face, only the sleepy Z. */
  head?: PixelHead | null;
  /** Screen px of one sprite pixel (the pet is 16 of them wide). */
  pixel?: number;
  /** The idle sway left and right; off in lists and tests. */
  sway?: boolean;
  testID?: string;
};

/**
 * The 8-bit pet (11.12). One look = `species_coat_mood`: a PNG from `pngs.ts` when there is one (Muk's art), else the
 * pixel grid drawn in code. Pixels of one color in a row are merged into one View, so a sprite is ~100 Views, not 256.
 */
export function PetSprite({ species, coat, mood, head, pixel = 8, sway = true, testID }: Props) {
  const size = SPRITE_SIZE * pixel;
  const key = spriteKey(species, coat, mood);
  const shift = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!sway) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(shift, { toValue: pixel, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(shift, { toValue: -pixel, duration: 1800, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(shift, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [shift, sway, pixel]);

  const rows = useMemo(() => {
    if (!head) return runs(spritePixels(species, coat, mood));
    const pixels = headPixels(head);
    return runs(mood === "sleepy" ? withZzz(pixels) : pixels);
  }, [head, species, coat, mood]);
  const png = head ? undefined : PIXEL_PNGS[key];

  return (
    <Animated.View
      accessibilityLabel={`${species} feeling ${mood}`}
      accessibilityRole="image"
      style={{ width: size, height: size, transform: [{ translateX: shift }] }}
      testID={testID}
    >
      {png ? (
        <Image source={png} style={[{ width: size, height: size }, styles.crisp]} />
      ) : (
        rows.map((row, y) => (
          <View key={y} style={styles.row}>
            {row.map((run, i) => (
              <View key={i} style={{ width: run.length * pixel, height: pixel, backgroundColor: run.color ?? "transparent" }} />
            ))}
          </View>
        ))
      )}
    </Animated.View>
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
  // Keeps a small PNG blocky instead of blurred (web; native ignores it).
  crisp: { imageRendering: "pixelated" } as object,
});
