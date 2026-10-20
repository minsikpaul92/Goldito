import { Pressable, StyleSheet, Text, View } from "react-native";

import { Avatar } from "./ui/Avatar";
import type { ChatPet } from "../features/chat/chatApi";
import { SPECIES_EMOJI } from "../features/pets/petFormat";
import { photoThumb, type ProfilePhoto } from "../features/profile/profilePhotosApi";
import { useThemedStyles } from "../providers/ThemeProvider";
import { Theme } from "../theme/themes";

export type HeaderStay = { dropOffAt: string; pickUpAt: string; pets: (ChatPet & { species?: "dog" | "cat" })[] };

type Props = {
  name: string;
  cover: ProfilePhoto | null;
  stay: HeaderStay | null;
  /** The avatar opens the photos (only when there are some); the name opens the sitter (owners only). */
  onAvatar?: () => void;
  onName?: () => void;
};

/** The chat's header: the person (avatar and name, each tappable) and, pinned under it, the pets of the stay. */
export function ChatHeaderTitle({ name, cover, stay, onAvatar, onName }: Props) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.root} testID="chat-header">
      <Pressable accessibilityRole="button" accessibilityLabel={`${name}'s photos`} disabled={!onAvatar} onPress={onAvatar} testID="chat-header-avatar">
        {cover ? <Avatar kind="photo" uri={photoThumb(cover, 120)} size={36} /> : <Avatar kind="initial" name={name} size={36} />}
      </Pressable>
      <View style={styles.text}>
        <Pressable accessibilityRole="button" accessibilityLabel={`${name}'s profile`} disabled={!onName} onPress={onName} testID="chat-header-name">
          <Text style={styles.name} numberOfLines={1}>
            {name}
          </Text>
        </Pressable>
        {stay ? (
          <View style={styles.stay} testID="chat-header-stay">
            {stay.pets.map((pet) => (
              <Text key={pet.id} accessibilityLabel={pet.name} style={styles.pet} testID={`chat-header-pet-${pet.name}`}>
                {pet.species ? SPECIES_EMOJI[pet.species] : "🐾"}
              </Text>
            ))}
          </View>
        ) : null}
      </View>
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    root: { flexDirection: "row", alignItems: "center", gap: theme.spacing.sm, maxWidth: 300 },
    text: { flexShrink: 1 },
    name: { fontSize: theme.fontSize.body, fontWeight: theme.fontWeight.bold, color: theme.color.text },
    stay: { flexDirection: "row", alignItems: "center", gap: 4 },
    pet: { fontSize: 14 },
  });
