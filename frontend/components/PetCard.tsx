import Ionicons from "@expo/vector-icons/Ionicons";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Avatar } from "./ui/Avatar";
import { Tag } from "./ui/Tag";
import type { InCare } from "../features/care/useInCare";
import { SPECIES_EMOJI, SPECIES_LABEL, ageLabel, describePet } from "../features/pets/petFormat";
import { formatInstant } from "../features/schedule/dates";
import { useTheme, useThemedStyles } from "../providers/ThemeProvider";
import { Pet } from "../types/db";
import { Theme } from "../theme/themes";

type Props = {
  pet: Pet;
  onPress: () => void;
  /** Set while a sitter has this pet right now. */
  inCare?: InCare;
  /** (Expressive) Color-block ground for the card; ignored in skins without blocks. */
  tone?: "peach" | "butter" | "mint" | "blush";
  /** `tile` = the compact half-width tile from the Figma Home (#147 frame): no chevron, allergies as one warning line. */
  layout?: "row" | "tile";
};

/** The tile line from the Figma Home: breed (or species) and age. The full facts stay in the accessibility label. */
function shortFacts(pet: Pet): string {
  return [pet.breed || SPECIES_LABEL[pet.species], ageLabel(pet.birthdate)].filter(Boolean).join(" · ");
}

/** Owner Home card: species icon, name, short facts, allergies. */
export function PetCard({ pet, onPress, inCare, tone, layout = "row" }: Props) {
  const tile = layout === "tile";
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${pet.name}, ${describePet(pet)}`}
      onPress={onPress}
      style={({ pressed }) => [styles.card, tile && styles.tile, tone && theme.ui.blocks && !inCare && styles.block, tone && theme.ui.blocks && !inCare && styles[tone], inCare && styles.cardInCare, pressed && styles.pressed]}
      testID={`pet-card-${pet.name}`}
    >
      {inCare ? (
        <View style={styles.inCareLabel} pointerEvents="none">
          <Text style={styles.inCareLabelText}>In care</Text>
        </View>
      ) : null}
      <Avatar kind="emoji" emoji={SPECIES_EMOJI[pet.species]} size={tile ? 48 : 56} />
      <View style={styles.body}>
        <Text style={styles.name}>{pet.name}</Text>
        {inCare ? (
          <Text style={styles.inCareText} testID={`in-care-${pet.name}`}>
            {`with ${inCare.sitterName} · until ${formatInstant(inCare.until)}`}
          </Text>
        ) : null}
        <Text style={styles.facts}>{tile ? shortFacts(pet) : describePet(pet)}</Text>
        {tile && pet.pet_allergies.length > 0 ? (
          <View style={styles.tileAllergy}>
            <Ionicons name="warning" size={14} color={theme.color.warning} accessibilityElementsHidden importantForAccessibility="no" />
            <Text style={styles.tileAllergyText}>{`No ${pet.pet_allergies.map((a) => a.allergen).join(", ")}`}</Text>
          </View>
        ) : null}
        {!tile && pet.pet_allergies.length > 0 ? (
          <View style={styles.allergies}>
            <Text style={styles.allergyLabel}>Allergies</Text>
            {pet.pet_allergies.map((allergy) => (
              <Tag key={allergy.id} tone="warning" label={allergy.allergen} />
            ))}
          </View>
        ) : null}
      </View>
      {tile ? null : <Ionicons name="chevron-forward" size={theme.icon.sm} color={theme.color.textMuted} />}
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
    tile: { flexBasis: "47%", flexGrow: 1, alignItems: "flex-start", gap: theme.spacing.sm, padding: 12 },
    tileAllergy: { flexDirection: "row", alignItems: "center", gap: 4 },
    tileAllergyText: { fontSize: theme.fontSize.small, fontWeight: theme.fontWeight.bold, color: theme.color.warning },
    // Expressive color blocks, as on the Figma owner Home.
    block: { borderWidth: 0, borderRadius: theme.ui.radius.block },
    peach: { backgroundColor: theme.color.blockPeach },
    butter: { backgroundColor: theme.color.blockButter },
    mint: { backgroundColor: theme.color.blockMint },
    blush: { backgroundColor: theme.color.blockBlush },
    body: {
      flex: 1,
      gap: theme.spacing.xs,
    },
    name: {
      fontSize: theme.fontSize.body,
      fontWeight: theme.fontWeight.semibold,
      color: theme.color.text,
      ...(theme.fontFamily.display ? { fontFamily: theme.fontFamily.display, fontWeight: undefined, fontSize: 18 } : null),
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
    inCareLabelText: { fontSize: theme.fontSize.small, fontWeight: theme.fontWeight.bold, color: theme.color.primaryText },
    inCareText: { fontSize: theme.fontSize.small, fontWeight: theme.fontWeight.semibold, color: theme.color.primary },
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
      fontWeight: theme.fontWeight.semibold,
      color: theme.color.text,
    },
  });
