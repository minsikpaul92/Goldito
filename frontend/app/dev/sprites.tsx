import { Redirect } from "expo-router";
import { useState } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";

import { PetSprite } from "../../components/pet/PetSprite";
import { Button } from "../../components/ui/Button";
import { Screen } from "../../components/ui/Screen";
import { colorsFromPhoto } from "../../features/pets/sprites/colorsFromPhoto";
import type { PixelColors } from "../../features/pets/sprites/photoColors";
import type { Pose } from "../../features/pets/sprites/scene";
import { COAT_PALETTES, SHAPES, type Shape } from "../../features/pets/sprites/sprites";
import { pickMedia } from "../../lib/media";
import type { PetMood } from "../../lib/petStatus";
import { useThemedStyles } from "../../providers/ThemeProvider";
import { Theme } from "../../theme/themes";
import type { Species } from "../../types/db";

/** Every placeholder sprite: species x head shape x mood, and each shape in every coat (11.12). Only with EXPO_PUBLIC_DEV_ROUTES=1. */
const devRoutesEnabled = process.env.EXPO_PUBLIC_DEV_ROUTES === "1";

const MOODS: PetMood[] = ["excited", "calm", "tired", "hungry", "sleepy"];
const SPECIES: Species[] = ["dog", "cat"];
/** One breed per head shape, so the gallery also shows the breed mapping. */
const SAMPLE_BREED: Record<Shape, string> = {
  floppy: "Golden Retriever",
  pointy: "Siberian Husky",
  fluffy: "Maltese",
  flat: "Pug",
  short: "Domestic Shorthair",
  long: "Maine Coon",
};

export default function SpriteGallery() {
  if (!devRoutesEnabled) return <Redirect href="/" />;
  return <Gallery />;
}

const POSES: { label: string; pose: Pose; facing?: "left" | "right" }[] = [
  { label: "front", pose: { view: "front", action: "idle", frame: 0 } },
  { label: "front 2", pose: { view: "front", action: "idle", frame: 1 } },
  { label: "side", pose: { view: "side", action: "idle", frame: 0 } },
  { label: "walk 1", pose: { view: "side", action: "walk", frame: 0 } },
  { label: "walk 2", pose: { view: "side", action: "walk", frame: 1 } },
  { label: "walk 3", pose: { view: "side", action: "walk", frame: 2 } },
  { label: "walk 4", pose: { view: "side", action: "walk", frame: 3 } },
  { label: "left", pose: { view: "side", action: "idle", frame: 0 }, facing: "left" },
  { label: "lie 1", pose: { view: "side", action: "lie", frame: 0 } },
  { label: "lie 2", pose: { view: "side", action: "lie", frame: 1 } },
  { label: "back", pose: { view: "back", action: "idle", frame: 0 } },
];

function Gallery() {
  const styles = useThemedStyles(makeStyles);
  const [big, setBig] = useState(false);
  const [only, setOnly] = useState<string | null>(null);
  const z = big ? 2 : 1;
  return (
    <Screen contentStyle={styles.page}>
      <Button label={big ? "Smaller" : "Bigger"} onPress={() => setBig(!big)} testID="sprite-zoom" />
      <View style={styles.row}>
        {["all", ...SPECIES.flatMap((sp) => SHAPES[sp].map((sh) => `${sp}-${sh}`))].map((id) => (
          <Pressable key={id} onPress={() => setOnly(id === "all" ? null : id)} testID={`sprite-only-${id}`}>
            <Text style={[styles.chip, (only ?? "all") === id && styles.chipOn]}>{id}</Text>
          </Pressable>
        ))}
      </View>
      <FromPhoto />
      {SPECIES.map((species) =>
        SHAPES[species].filter((shape) => !only || only === `${species}-${shape}`).map((shape) => (
          <View key={`${species}-${shape}`} style={styles.block}>
            <Text style={styles.label}>{`${species} ${shape} (${SAMPLE_BREED[shape]})`}</Text>
            <View style={styles.row}>
              {MOODS.map((mood) => (
                <View key={mood} style={styles.cell}>
                  <PetSprite species={species} breed={SAMPLE_BREED[shape]} mood={mood} pixel={2 * z} testID={`sprite-${species}-${shape}-${mood}`} />
                  <Text style={styles.mood}>{mood}</Text>
                </View>
              ))}
            </View>
            <View style={styles.row}>
              {POSES.map(({ label, pose, facing }) => (
                <View key={label} style={styles.cell}>
                  <PetSprite species={species} breed={SAMPLE_BREED[shape]} mood="calm" pose={pose} facing={facing} pixel={2 * z} testID={`sprite-${species}-${shape}-${label}`} />
                  <Text style={styles.mood}>{label}</Text>
                </View>
              ))}
            </View>
            <View style={styles.row}>
              {POSES.filter((p) => ["front", "side", "back", "lie 1"].includes(p.label)).map(({ label, pose, facing }) => (
                <View key={label} style={styles.cell}>
                  <PetSprite species={species} breed={SAMPLE_BREED[shape]} mood="calm" pose={pose} facing={facing} hat="pumpkin" pixel={2 * z} testID={`sprite-${species}-${shape}-hat-${label}`} />
                  <Text style={styles.mood}>{`hat ${label}`}</Text>
                </View>
              ))}
              {Object.keys(COAT_PALETTES).map((coat) => (
                <View key={coat} style={styles.cell}>
                  <PetSprite species={species} breed={SAMPLE_BREED[shape]} coat={coat} mood="calm" pixel={z} />
                  <Text style={styles.mood}>{coat}</Text>
                </View>
              ))}
            </View>
          </View>
        )),
      )}
    </Screen>
  );
}

/** Colors from a photo: pick a photo, the biggest pet is cut out at its centre and its colors paint a preset. */
function FromPhoto() {
  const styles = useThemedStyles(makeStyles);
  const [photo, setPhoto] = useState<string | null>(null);
  const [colors, setColors] = useState<PixelColors | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pick = async () => {
    const picked = await pickMedia({ purpose: "sticker", mediaTypes: ["image"] });
    if (!picked) return;
    setBusy(true);
    setError(null);
    setColors(null);
    try {
      const made = await colorsFromPhoto(picked.file);
      setPhoto(made.photo);
      setColors(made.colors);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.block}>
      <Text style={styles.label}>Colors from a photo</Text>
      <View style={styles.row}>
        {photo ? <Image source={{ uri: photo }} style={styles.photo} /> : null}
        {colors ? <PetSprite species="dog" breed="Maltese" mood="calm" colors={colors} pixel={4} testID="sprite-from-photo" /> : null}
      </View>
      {error ? <Text style={styles.mood}>{error}</Text> : null}
      <Button label={busy ? "Reading colors..." : "Pick a photo"} onPress={pick} disabled={busy} testID="sprite-pick-photo" />
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    page: { gap: theme.spacing.md },
    block: { gap: theme.spacing.xs },
    label: { color: theme.color.text, fontWeight: "600" },
    row: { flexDirection: "row", gap: theme.spacing.sm, flexWrap: "wrap" },
    cell: { alignItems: "center", gap: 2 },
    mood: { color: theme.color.textMuted, fontSize: 10 },
    chip: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, overflow: "hidden", color: theme.color.text, backgroundColor: theme.color.surface, fontSize: 12 },
    chipOn: { backgroundColor: theme.color.primary, color: theme.color.primaryText },
    photo: { width: 128, height: 128, borderRadius: theme.radius.md },
  });
