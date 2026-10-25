import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { ChatPetRow } from "./ChatPetAvatars";
import { PetGlance } from "./PetGlance";
import { Avatar } from "./ui/Avatar";
import { Sheet } from "./ui/Sheet";
import { loadChatThreadPets, type ChatPet, type ChatPetFace } from "../features/chat/chatApi";
import { photoThumb, type ProfilePhoto } from "../features/profile/profilePhotosApi";
import { useThemedStyles } from "../providers/ThemeProvider";
import { Theme } from "../theme/themes";

export type HeaderStay = { dropOffAt: string; pickUpAt: string; pets: (ChatPet & { species?: "dog" | "cat" })[] };

type Props = {
  threadId: string;
  /** The sitter sees the owner's pets under the name; the owner is talking to the sitter and does not. */
  showPets?: boolean;
  name: string;
  cover: ProfilePhoto | null;
  stay: HeaderStay | null;
  /** The avatar opens the photos (only when there are some); the name opens the sitter (owners only). */
  onAvatar?: () => void;
  onName?: () => void;
};

/** The chat's header: the person (avatar and name, each tappable) and, pinned under it, the pets of the stay. */
export function ChatHeaderTitle({ threadId, showPets, name, cover, stay, onAvatar, onName }: Props) {
  const styles = useThemedStyles(makeStyles);
  const [faces, setFaces] = useState<ChatPetFace[]>([]);
  const [open, setOpen] = useState<ChatPetFace | null>(null);
  // Read again when the stay on the latest card changes (other pets, or none).
  const petKey = stay ? stay.pets.map((p) => p.id).join(",") : "";
  useEffect(() => {
    if (!showPets) return;
    let live = true;
    void loadChatThreadPets(threadId).then((list) => live && setFaces(list));
    return () => {
      live = false;
    };
  }, [showPets, threadId, petKey]);
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
        {showPets && faces.length > 0 ? <ChatPetRow pets={faces} onPressPet={setOpen} /> : null}
      </View>
      <Sheet visible={open !== null} title={open?.name ?? ""} onClose={() => setOpen(null)} testID="chat-pet-sheet">
        {open ? <PetGlance petId={open.id} bare emptyText={[open.species === "cat" ? "Cat" : "Dog", open.breed].filter(Boolean).join(" · ")} testID={`chat-pet-glance-${open.name}`} /> : null}
      </Sheet>
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    root: { flexDirection: "row", alignItems: "center", gap: theme.spacing.sm, maxWidth: 300 },
    text: { flexShrink: 1 },
    name: { fontSize: theme.fontSize.body, fontWeight: theme.fontWeight.bold, color: theme.color.text },
  });
