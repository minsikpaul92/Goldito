import { Redirect } from "expo-router";
import { useState } from "react";
import { Image, StyleSheet, Text, View } from "react-native";

import { PetSprite } from "../../components/pet/PetSprite";
import { Button } from "../../components/ui/Button";
import { Screen } from "../../components/ui/Screen";
import { pixelize, type PixelHead } from "../../features/pets/sprites/pixelize";
import { COAT_PALETTES } from "../../features/pets/sprites/sprites";
import { segmentAt } from "../../features/snap/cutout";
import { detectPets, loadFrames } from "../../features/snap/vision";
import { pickMedia } from "../../lib/media";
import type { PetMood } from "../../lib/petStatus";
import { useThemedStyles } from "../../providers/ThemeProvider";
import { Theme } from "../../theme/themes";
import type { Species } from "../../types/db";

/** Every placeholder sprite: species x coat x mood (11.12). Only with EXPO_PUBLIC_DEV_ROUTES=1. */
const devRoutesEnabled = process.env.EXPO_PUBLIC_DEV_ROUTES === "1";

const MOODS: PetMood[] = ["excited", "calm", "tired", "hungry", "sleepy"];
const SPECIES: Species[] = ["dog", "cat"];

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
        Object.keys(COAT_PALETTES).map((coat) => (
          <View key={`${species}-${coat}`} style={styles.block}>
            <Text style={styles.label}>{`${species} ${coat}`}</Text>
            <View style={styles.row}>
              {MOODS.map((mood) => (
                <View key={mood} style={styles.cell}>
                  <PetSprite species={species} coat={coat} mood={mood} pixel={3} sway={false} testID={`sprite-${species}-${coat}-${mood}`} />
                  <Text style={styles.mood}>{mood}</Text>
                </View>
              ))}
            </View>
          </View>
        )),
      )}
    </Screen>
  );
}

/** Photo to pixel head: pick a photo, the biggest pet is cut out at its centre and drawn as a 16x16 head. */
function FromPhoto() {
  const styles = useThemedStyles(makeStyles);
  const [photo, setPhoto] = useState<string | null>(null);
  const [head, setHead] = useState<PixelHead | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pick = async () => {
    const picked = await pickMedia({ purpose: "sticker", mediaTypes: ["image"] });
    if (!picked) return;
    setBusy(true);
    setError(null);
    setHead(null);
    try {
      const [frame] = await loadFrames(picked.file);
      setPhoto(frame.toDataURL("image/jpeg", 0.85));
      const biggest = [...(await detectPets(frame))].sort((a, b) => b.w * b.h - a.w * a.h)[0];
      const at = biggest ? { x: biggest.x + biggest.w / 2, y: biggest.y + biggest.h / 2 } : { x: 0.5, y: 0.5 };
      setHead(pixelize(frame, await segmentAt(frame, at)));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.block}>
      <Text style={styles.label}>From a photo</Text>
      <View style={styles.row}>
        {photo ? <Image source={{ uri: photo }} style={styles.photo} /> : null}
        {head ? <PetSprite species="dog" mood="calm" head={head} pixel={8} testID="sprite-from-photo" /> : null}
      </View>
      {error ? <Text style={styles.mood}>{error}</Text> : null}
      <Button label={busy ? "Making..." : "Pick a photo"} onPress={pick} disabled={busy} testID="sprite-pick-photo" />
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
