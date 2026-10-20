import { Redirect } from "expo-router";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { PixelPet } from "../../components/PixelPet";
import { PET_COATS, PET_MOODS, PET_SPRITES, PetSpriteKey } from "../../lib/petSprites";
import { useThemedStyles } from "../../providers/ThemeProvider";
import { Theme } from "../../theme/themes";

/** Every pixel pet preset (#184): species × coat × mood, animated. Only available with EXPO_PUBLIC_DEV_ROUTES=1. */
const devRoutesEnabled = process.env.EXPO_PUBLIC_DEV_ROUTES === "1";

const ROWS = [
  ...PET_COATS.dog.map((c) => ({ species: "dog", coat: c })),
  ...PET_COATS.cat.map((c) => ({ species: "cat", coat: c })),
];

export default function PixelPetsScreen() {
  const styles = useThemedStyles(makeStyles);
  if (!devRoutesEnabled) return <Redirect href="/" />;
  return (
    <ScrollView contentContainerStyle={styles.page} testID="dev-pixel-pets">
      <Text style={styles.title}>Pixel pet presets</Text>
      <Text style={styles.note}>Keys are species-coat-mood, in assets/pixel-pets/. Each strip has two frames.</Text>
      {ROWS.map(({ species, coat }) => (
        <View key={`${species}-${coat}`} style={styles.block}>
          <Text style={styles.row}>{`${species} · ${coat}`}</Text>
          <View style={styles.grid}>
            {PET_MOODS.map((mood) => {
              const key = `${species}-${coat}-${mood}` as PetSpriteKey;
              return (
                <View key={key} style={styles.cell}>
                  <PixelPet source={PET_SPRITES[key]} size={96} accessibilityLabel={`${species} ${coat}, ${mood}`} testID={`pixel-pet-${key}`} />
                  <Text style={styles.mood}>{mood}</Text>
                </View>
              );
            })}
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    page: { padding: theme.spacing.md, gap: theme.spacing.md, backgroundColor: theme.color.background },
    title: { fontSize: theme.fontSize.title, fontWeight: theme.fontWeight.bold, color: theme.color.text },
    note: { fontSize: theme.fontSize.small, color: theme.color.textMuted },
    block: { gap: theme.spacing.sm },
    row: { fontSize: theme.fontSize.body, fontWeight: theme.fontWeight.semibold, color: theme.color.text },
    grid: { flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.sm },
    cell: { alignItems: "center", gap: 2 },
    mood: { fontSize: theme.fontSize.small, color: theme.color.textMuted },
  });
