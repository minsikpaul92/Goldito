import { Redirect } from "expo-router";
import { StyleSheet, Text, View } from "react-native";

import { PetSprite } from "../../components/pet/PetSprite";
import { Screen } from "../../components/ui/Screen";
import { COAT_PALETTES } from "../../features/pets/sprites/sprites";
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

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    page: { gap: theme.spacing.md },
    block: { gap: theme.spacing.xs },
    label: { color: theme.color.text, fontWeight: "600" },
    row: { flexDirection: "row", gap: theme.spacing.sm, flexWrap: "wrap" },
    cell: { alignItems: "center", gap: 2 },
    mood: { color: theme.color.textMuted, fontSize: 10 },
  });
