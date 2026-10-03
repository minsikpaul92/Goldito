import Ionicons from "@expo/vector-icons/Ionicons";
import { StyleSheet, Text, View } from "react-native";

import { AppearIn } from "./ui/AppearIn";
import { Chip } from "./ui/Chip";
import { PressableScale } from "./ui/PressableScale";
import { SPECIES_EMOJI, describePet } from "../features/pets/petFormat";
import { useTheme, useThemedStyles } from "../providers/ThemeProvider";
import { Pet } from "../types/db";
import { Theme } from "../theme/themes";

type Props = {
  pet: Pet;
  onPress: () => void;
  /** Just added by the owner: the card rises in and the avatar pops once. */
  justAdded?: boolean;
};

/** Owner Home card: species icon, name, short facts, allergies. */
export function PetCard({ pet, onPress, justAdded = false }: Props) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);

  return (
    <AppearIn enabled={justAdded}>
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={`${pet.name}, ${describePet(pet)}`}
        onPress={onPress}
        style={styles.card}
        testID={`pet-card-${pet.name}`}
      >
        <AppearIn enabled={justAdded} pop delay={theme.motion.fast}>
          <View style={styles.avatar}>
            <Text style={styles.avatarEmoji}>{SPECIES_EMOJI[pet.species]}</Text>
          </View>
        </AppearIn>
        <View style={styles.body}>
          <Text style={styles.name}>{pet.name}</Text>
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
      </PressableScale>
    </AppearIn>
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
