import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";

import { PetPhoto, loadPetPhotos, petPhotoThumb } from "../../features/ownerOnboarding/petPhotosApi";
import { describePet } from "../../features/pets/petFormat";
import { useTheme, useThemedStyles } from "../../providers/ThemeProvider";
import { Theme } from "../../theme/themes";
import { tokens } from "../../theme/tokens";
import { Pet } from "../../types/db";
import { Icon } from "../ui/Icon";
import { PhotoViewerSheet } from "../PhotoViewerSheet";
import { HomeArt } from "./HomeArt";
import { HOME_TEXT } from "./homeType";

/** Tinted grounds in the order Figma uses them: blush, peach, then butter and mint. */
export const PET_GROUNDS = [tokens.color.blockBlush, tokens.color.blockPeach, tokens.color.blockButter, tokens.color.blockMint];

/** "Maltese · 4 yrs" (Figma shows breed and age; `describePet` also has species and weight). */
function facts(pet: Pet): string {
  const parts = describePet(pet).split(" · ");
  return parts.length > 1 ? parts.slice(1, 3).join(" · ") : parts[0];
}

/** Owner Home "Your pets": one tinted tile per pet (Figma "pet.r" / "pet.p"). */
export function PetTile({ pet, index, onPress }: { pet: Pet; index: number; onPress: () => void }) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [photos, setPhotos] = useState<PetPhoto[]>([]);
  const [viewing, setViewing] = useState(false);

  // Read again whenever Home comes back into view: a photo added on the pet screen shows up here.
  useFocusEffect(
    useCallback(() => {
      let live = true;
      loadPetPhotos(pet.id)
        .then((list) => live && setPhotos(list))
        .catch(() => {});
      return () => {
        live = false;
      };
    }, [pet.id]),
  );

  return (
    <>
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${pet.name}, ${describePet(pet)}`}
      onPress={onPress}
      style={({ pressed }) => [styles.tile, { backgroundColor: PET_GROUNDS[index % PET_GROUNDS.length] }, pressed && styles.pressed]}
      testID={`pet-card-${pet.name}`}
    >
      {/* The face opens the pet's photos big; without a photo it is just the tile (Figma slot: see HomeArt). */}
      <Pressable
        accessibilityRole={photos.length > 0 ? "button" : undefined}
        accessibilityLabel={`${pet.name}'s photos`}
        disabled={photos.length === 0}
        onPress={() => setViewing(true)}
        style={styles.face}
        testID={`pet-card-face-${pet.name}`}
      >
        {photos.length > 0 ? (
          <Image source={{ uri: petPhotoThumb(photos[0].publicId, 104) }} style={styles.photo} testID={`pet-card-photo-${pet.name}`} accessibilityIgnoresInvertColors />
        ) : (
          <HomeArt name="paw" size={30} color={theme.color.text} />
        )}
      </Pressable>
      <View style={styles.body}>
        <Text style={styles.name} numberOfLines={1}>
          {pet.name}
        </Text>
        <Text style={styles.facts} numberOfLines={1}>
          {facts(pet)}
        </Text>
        {pet.pet_allergies.length > 0 ? (
          <View style={styles.allergy}>
            <Icon name="warning" size={13} color={theme.color.warning} />
            <Text style={styles.allergyText} numberOfLines={1}>{`No ${pet.pet_allergies[0].allergen}`}</Text>
          </View>
        ) : null}
      </View>
    </Pressable>
    {/* Outside the tile: a tap inside the sheet must not reach the tile's own press. */}
    <PhotoViewerSheet visible={viewing} title={pet.name} photos={photos} onClose={() => setViewing(false)} testID={`pet-photos-${pet.name}`} />
    </>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    tile: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8, padding: 12, borderRadius: theme.radius.xl },
    pressed: { opacity: 0.85 },
    face: { width: 52, height: 52, borderRadius: 26, overflow: "hidden", alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.6)" },
    photo: { width: "100%", height: "100%" },
    body: { flex: 1, minWidth: 0 },
    name: { fontSize: HOME_TEXT.name, lineHeight: 23.8, fontWeight: theme.fontWeight.bold, letterSpacing: -0.17, color: theme.color.text },
    facts: { fontSize: HOME_TEXT.body, lineHeight: 17.5, color: theme.color.textMuted },
    allergy: { flexDirection: "row", alignItems: "center", gap: 3 },
    allergyText: { flexShrink: 1, fontSize: HOME_TEXT.body, lineHeight: 17.5, fontWeight: theme.fontWeight.bold, color: theme.color.warning },
  });
