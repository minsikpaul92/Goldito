import { Image, StyleSheet, View } from "react-native";

import { Art } from "./art/Art";
import { petPhotoThumb } from "../features/ownerOnboarding/petPhotosApi";
import { useThemedStyles } from "../providers/ThemeProvider";
import { Theme } from "../theme/themes";

export type PetFaceInfo = {
  species: "dog" | "cat";
  /** Public id of the pet's first photo, when it has one. */
  photo?: string | null;
  name?: string;
};

/** A pet's round face (its first photo, else the dog or cat drawing), with a light ring so it reads on a photo. */
export function PetFace({ pet, size }: { pet: PetFaceInfo; size: number }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={[styles.face, { width: size, height: size, borderRadius: size / 2 }]}>
      {pet.photo ? (
        <Image source={{ uri: petPhotoThumb(pet.photo, size * 3) }} style={styles.photo} accessibilityIgnoresInvertColors />
      ) : (
        <Art name={pet.species === "cat" ? "snap/chip-cat" : "snap/chip-dog"} size={size - 4} />
      )}
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    face: {
      overflow: "hidden",
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.color.surface,
      borderWidth: 2,
      borderColor: theme.color.surface,
    },
    photo: { width: "100%", height: "100%" },
  });
