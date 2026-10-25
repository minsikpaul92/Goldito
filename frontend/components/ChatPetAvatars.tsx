import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { PetFace } from "./PetFace";
import type { ChatPetFace } from "../features/chat/chatApi";
import { useThemedStyles } from "../providers/ThemeProvider";
import { Theme } from "../theme/themes";

/** Names sit beside the faces while they fit in about this many characters; past that only the faces show. */
const NAMES_FIT = 18;

const faceOf = (pet: ChatPetFace) => ({ species: pet.species ?? "dog", photo: pet.photo, name: pet.name });

/**
 * The pets of the stay in the chat header: a face and a name each. When the names are too long the faces stand alone and
 * a name shows while the mouse is over its face. A tap opens the pet's details.
 */
export function ChatPetRow({ pets, onPressPet, size = 24, max = 4 }: { pets: ChatPetFace[]; onPressPet: (pet: ChatPetFace) => void; size?: number; max?: number }) {
  const styles = useThemedStyles(makeStyles);
  const [hover, setHover] = useState<string | null>(null);
  const shown = pets.slice(0, max);
  const extra = pets.length - shown.length;
  const namesFit = shown.map((p) => p.name).join(", ").length <= NAMES_FIT;
  return (
    <View style={styles.row} testID="chat-header-stay">
      {shown.map((pet) => (
        <Pressable
          key={pet.id}
          accessibilityRole="button"
          accessibilityLabel={`${pet.name}, details`}
          onPress={() => onPressPet(pet)}
          onHoverIn={() => setHover(pet.id)}
          onHoverOut={() => setHover(null)}
          style={styles.pet}
          testID={`chat-header-pet-${pet.name}`}
        >
          <PetFace pet={faceOf(pet)} size={size} />
          {namesFit || hover === pet.id ? (
            <Text style={styles.name} numberOfLines={1}>
              {pet.name}
            </Text>
          ) : null}
        </Pressable>
      ))}
      {extra > 0 ? <Text style={styles.name}>{`+${extra}`}</Text> : null}
    </View>
  );
}

/** The pets of the stay in a chat list row: overlapping faces, no names (there is no room). */
export function ChatPetStack({ pets, size = 28, max = 3, testID }: { pets: ChatPetFace[]; size?: number; max?: number; testID?: string }) {
  const styles = useThemedStyles(makeStyles);
  if (pets.length === 0) return null;
  const shown = pets.slice(0, max);
  const extra = pets.length - shown.length;
  return (
    <View style={styles.stack} accessibilityLabel={pets.map((p) => p.name).join(", ")} testID={testID}>
      {shown.map((pet, i) => (
        <View key={pet.id} style={i > 0 ? { marginLeft: -size * 0.3 } : undefined}>
          <PetFace pet={faceOf(pet)} size={size} />
        </View>
      ))}
      {extra > 0 ? <Text style={styles.name}>{`+${extra}`}</Text> : null}
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    row: { flexDirection: "row", alignItems: "center", gap: theme.spacing.sm, flexWrap: "wrap" },
    pet: { flexDirection: "row", alignItems: "center", gap: 4 },
    stack: { flexDirection: "row", alignItems: "center" },
    name: { fontSize: theme.fontSize.small, color: theme.color.textMuted },
  });
