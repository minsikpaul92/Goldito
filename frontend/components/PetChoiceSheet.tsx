import { Pressable, StyleSheet, Text, View } from "react-native";

import { PetFace } from "./PetFace";
import { Sheet } from "./ui/Sheet";
import { useThemedStyles } from "../providers/ThemeProvider";
import { Theme } from "../theme/themes";

type Props = {
  visible: boolean;
  pets: { id: string; name: string; species: "dog" | "cat" }[];
  /** First photo of each pet, for the faces. */
  faces: Record<string, string | null>;
  onPick: (petId: string) => void;
  onClose: () => void;
};

/** "Which pet?": asked when a diary is started with two or more pets to write about. */
export function PetChoiceSheet({ visible, pets, faces, onPick, onClose }: Props) {
  const styles = useThemedStyles(makeStyles);
  return (
    <Sheet visible={visible} title="Which pet?" onClose={onClose} testID="diary-pick-pet">
      <View style={styles.list}>
        {pets.map((pet) => (
          <Pressable
            key={pet.id}
            accessibilityRole="button"
            accessibilityLabel={`Write ${pet.name}'s diary`}
            onPress={() => onPick(pet.id)}
            style={({ pressed }) => [styles.row, pressed && styles.pressed]}
            testID={`diary-pick-pet-${pet.id}`}
          >
            <PetFace pet={{ species: pet.species, photo: faces[pet.id] }} size={40} />
            <Text style={styles.name}>{pet.name}</Text>
          </Pressable>
        ))}
      </View>
    </Sheet>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    list: { gap: theme.spacing.sm },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.md,
      minHeight: theme.layout.touchTarget + 8,
      paddingHorizontal: theme.spacing.md,
      borderRadius: theme.radius.md,
      borderWidth: 1,
      borderColor: theme.color.border,
      backgroundColor: theme.color.surface,
    },
    pressed: { opacity: 0.6 },
    name: { fontSize: theme.fontSize.body, fontWeight: theme.fontWeight.semibold, color: theme.color.text },
  });
