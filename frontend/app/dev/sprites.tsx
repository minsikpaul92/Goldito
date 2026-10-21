import { Redirect } from "expo-router";
import { useState } from "react";
import { Image, StyleSheet, Text, View } from "react-native";

import { PetSprite } from "../../components/pet/PetSprite";
import { Button } from "../../components/ui/Button";
import { Screen } from "../../components/ui/Screen";
import { colorsFromPhoto } from "../../features/pets/sprites/colorsFromPhoto";
import type { PixelColors } from "../../features/pets/sprites/photoColors";
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

function Gallery() {
  const styles = useThemedStyles(makeStyles);
  return (
    <Screen contentStyle={styles.page}>
      <FromPhoto />
      {SPECIES.map((species) =>
        SHAPES[species].map((shape) => (
          <View key={`${species}-${shape}`} style={styles.block}>
            <Text style={styles.label}>{`${species} ${shape} (${SAMPLE_BREED[shape]})`}</Text>
            <View style={styles.row}>
              {MOODS.map((mood) => (
                <View key={mood} style={styles.cell}>
                  <PetSprite species={species} breed={SAMPLE_BREED[shape]} mood={mood} pixel={3} sway={false} testID={`sprite-${species}-${shape}-${mood}`} />
                  <Text style={styles.mood}>{mood}</Text>
                </View>
              ))}
            </View>
            <View style={styles.row}>
              {Object.keys(COAT_PALETTES).map((coat) => (
                <View key={coat} style={styles.cell}>
                  <PetSprite species={species} breed={SAMPLE_BREED[shape]} coat={coat} mood="calm" pixel={2} sway={false} />
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
        {colors ? <PetSprite species="dog" breed="Maltese" mood="calm" colors={colors} pixel={8} testID="sprite-from-photo" /> : null}
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
    photo: { width: 128, height: 128, borderRadius: theme.radius.md },
  });
