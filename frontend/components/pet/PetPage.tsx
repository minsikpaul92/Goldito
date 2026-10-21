import { router } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Screen } from "../ui/Screen";
import { useThemedStyles } from "../../providers/ThemeProvider";
import { Theme } from "../../theme/themes";
import type { Pet } from "../../types/db";
import { PetMedals } from "./PetMedals";
import { PetRoom } from "./PetRoom";

/** Owner Home, page two (11.12): the pet room of one pet, with a switch when there are several. Tap the pet: Diary. */
export function PetPage({ pets }: { pets: Pet[] }) {
  const styles = useThemedStyles(makeStyles);
  const [selected, setSelected] = useState(pets[0]?.id);
  const pet = pets.find((p) => p.id === selected) ?? pets[0];
  if (!pet) return null;

  return (
    <Screen contentStyle={styles.page} testID="pet-page">
      {pets.length > 1 ? (
        <View style={styles.switcher}>
          {pets.map((p) => (
            <Pressable
              key={p.id}
              accessibilityRole="button"
              accessibilityState={{ selected: p.id === pet.id }}
              onPress={() => setSelected(p.id)}
              style={[styles.pill, p.id === pet.id && styles.pillOn]}
              testID={`pet-switch-${p.name}`}
            >
              <Text style={[styles.pillText, p.id === pet.id && styles.pillTextOn]}>{p.name}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      <PetRoom
        pet={{ id: pet.id, name: pet.name, species: pet.species, coat: pet.profile?.coat }}
        onPress={() => router.push("/owner/diary")}
      />
      <PetMedals petId={pet.id} />
    </Screen>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    page: { gap: theme.spacing.md },
    switcher: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: theme.spacing.sm },
    pill: {
      minHeight: theme.layout.touchTarget,
      paddingHorizontal: theme.spacing.md,
      justifyContent: "center",
      borderRadius: theme.radius.pill,
      borderWidth: 1,
      borderColor: theme.color.border,
      backgroundColor: theme.color.surface,
    },
    pillOn: { backgroundColor: theme.color.primary, borderColor: theme.color.primary },
    pillText: { fontSize: theme.fontSize.body, fontWeight: theme.fontWeight.semibold, color: theme.color.text },
    pillTextOn: { color: theme.color.primaryText },
  });
