import Ionicons from "@expo/vector-icons/Ionicons";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Chip } from "./ui/Chip";
import type { InCare } from "../features/care/useInCare";
import { SPECIES_EMOJI, describePet } from "../features/pets/petFormat";
import { formatInstant } from "../features/schedule/dates";
import { useTheme, useThemedStyles } from "../providers/ThemeProvider";
import { Pet } from "../types/db";
import { Theme } from "../theme/themes";

type Props = {
  pet: Pet;
  onPress: () => void;
  /** Set while a sitter has this pet right now. */
  inCare?: InCare;
};

/** Owner Home card: species icon, name, short facts, allergies. */
export function PetCard({ pet, onPress, inCare }: Props) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${pet.name}, ${describePet(pet)}`}
      onPress={onPress}
      style={({ pressed }) => [styles.card, inCare && styles.cardInCare, pressed && styles.pressed]}
      testID={`pet-card-${pet.name}`}
    >
      {inCare ? (
        <View style={styles.inCareLabel} pointerEvents="none">
          <Text style={styles.inCareLabelText}>In care</Text>
        </View>
      ) : null}
      <View style={styles.avatar}>
        <Text style={styles.avatarEmoji}>{SPECIES_EMOJI[pet.species]}</Text>
      </View>
      <View style={styles.body}>
        <Text style={styles.name}>{pet.name}</Text>
        {inCare ? (
          <Text style={styles.inCareText} testID={`in-care-${pet.name}`}>
            {`with ${inCare.sitterName} · until ${formatInstant(inCare.until)}`}
          </Text>
        ) : null}
        <Text style={styles.facts}>{describePet(pet)}</Text>
        {pet.pet_allergies.length > 0 ? (
          <View style={styles.allergies}>
            <Text style={styles.allergyLabel}>Allergies</Text>
            {pet.pet_allergies.map((allergy) => (
              <Chip key={allergy.id} label={allergy.allergen} />
            ))}
          </View>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={theme.icon.sm} color={theme.color.textMuted} />
    </Pressable>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    card: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.md,
      padding: theme.spacing.md,
      borderRadius: theme.radius.lg,
      borderWidth: 1,
      borderColor: theme.color.border,
      backgroundColor: theme.color.surface,
    },
    pressed: {
      opacity: 0.8,
    },
    avatar: {
      width: theme.spacing.xl + theme.spacing.lg,
      height: theme.spacing.xl + theme.spacing.lg,
      borderRadius: (theme.spacing.xl + theme.spacing.lg) / 2,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.color.accent,
    },
    avatarEmoji: {
      fontSize: theme.icon.md,
    },
    body: {
      flex: 1,
      gap: theme.spacing.xs,
    },
    name: {
      fontSize: theme.fontSize.body,
      fontWeight: "600",
      color: theme.color.text,
    },
    // In care: tinted card, stronger border, and an "In care" tag sitting on the top-left border.
    cardInCare: { borderWidth: 2, borderColor: theme.color.primary, backgroundColor: theme.color.accent },
    inCareLabel: {
      position: "absolute",
      top: -11,
      left: theme.spacing.md,
      paddingHorizontal: theme.spacing.sm,
      borderRadius: theme.radius.sm,
      backgroundColor: theme.color.primary,
    },
    inCareLabelText: { fontSize: theme.fontSize.small, fontWeight: "700", color: theme.color.primaryText },
    inCareText: { fontSize: theme.fontSize.small, fontWeight: "600", color: theme.color.primary },
    facts: {
      fontSize: theme.fontSize.small,
      color: theme.color.textMuted,
    },
    allergies: {
      flexDirection: "row",
      flexWrap: "wrap",
      alignItems: "center",
      gap: theme.spacing.xs,
      marginTop: theme.spacing.xs,
    },
    allergyLabel: {
      fontSize: theme.fontSize.small,
      fontWeight: "600",
      color: theme.color.text,
    },
  });
