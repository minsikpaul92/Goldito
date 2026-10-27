import { router } from "expo-router";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Card } from "../ui/Card";
import { ActionRow } from "../ui/ActionRow";
import { asHat } from "../../features/pets/items";
import { asPetRecipe } from "../../features/pets/sprites/petLook";
import { asPixelColors } from "../../features/pets/sprites/photoColors";
import { useIsAdmin } from "../../lib/admins";
import { useThemedStyles } from "../../providers/ThemeProvider";
import { Theme } from "../../theme/themes";
import type { Pet } from "../../types/db";
import { PetColorsSheet } from "./PetColorsSheet";
import { PetSprite } from "./PetSprite";

/**
 * The pixel pet on the pet profile (11.12c): how the pet room draws this pet, made from the profile above it (breed,
 * coat, weight). The owner can take its colors from a photo; admins can edit the whole look.
 */
export function PetPixelCard({ pet, onChanged }: { pet: Pet; onChanged: () => void }) {
  const styles = useThemedStyles(makeStyles);
  const admin = useIsAdmin();
  const [matching, setMatching] = useState(false);
  const colors = asPixelColors(pet.profile?.pixel_colors);
  const look = asPetRecipe(pet.profile?.pixel_look);

  return (
    <Card style={styles.card} testID="pet-pixel-card">
      <View style={styles.top}>
        <View style={styles.stage}>
          <PetSprite
            species={pet.species}
            coat={pet.profile?.coat}
            breed={pet.breed}
            colors={colors}
            weightKg={pet.weight_kg}
            look={look}
            hat={asHat(pet.profile?.hat)}
            mood="calm"
            pixel={3}
            testID="pet-pixel-sprite"
          />
        </View>
        <View style={styles.text}>
          <Text style={styles.title}>Pixel pet</Text>
          <Text style={styles.caption}>{look ? "Look set by the Goldito team" : "From breed, coat and weight"}</Text>
        </View>
      </View>
      {/* A look set by the team wins over photo colors, so matching only shows without one. Same rows as the Pet room. */}
      {look && !admin ? null : (
        <View style={styles.actions}>
          {look ? null : <ActionRow icon="camera" title="Match colors from a photo" subtitle={`Use a photo of ${pet.name}`} onPress={() => setMatching(true)} testID="pet-colors-open" />}
          {admin ? <ActionRow icon="palette" title="Edit look" subtitle="Breed, shape and colors" onPress={() => router.push(`/owner/pets/${pet.id}/look`)} testID="pet-pixel-edit" /> : null}
        </View>
      )}
      <PetColorsSheet
        visible={matching}
        onClose={() => setMatching(false)}
        pet={{ id: pet.id, name: pet.name, species: pet.species, coat: pet.profile?.coat, breed: pet.breed, colors }}
        onSaved={onChanged}
      />
    </Card>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    // 16 all round; the top row, then the Action Rows 16 below it and 10 apart (the Pet room's rhythm).
    card: { padding: theme.spacing.md, gap: theme.spacing.md },
    top: { flexDirection: "row", alignItems: "center", gap: theme.spacing.md },
    stage: { width: 96, height: 96, borderRadius: theme.radius.md, overflow: "hidden", backgroundColor: theme.color.background },
    text: { flex: 1, minWidth: 0, gap: theme.spacing.xs },
    title: { fontSize: theme.fontSize.option, fontWeight: theme.fontWeight.bold, color: theme.color.text },
    actions: { gap: 10 },
    caption: { fontSize: theme.fontSize.small, lineHeight: theme.lineHeight.small, color: theme.color.textMuted },
  });
