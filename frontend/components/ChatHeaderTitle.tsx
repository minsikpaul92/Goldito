import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { ChatPetRow } from "./ChatPetAvatars";
import { PetGlance } from "./PetGlance";
import { Avatar } from "./ui/Avatar";
import { Sheet } from "./ui/Sheet";
import { loadChatPetMeta, type ChatPet, type ChatPetFace } from "../features/chat/chatApi";
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
  const [meta, setMeta] = useState<Awaited<ReturnType<typeof loadChatPetMeta>>>(new Map());
  const [open, setOpen] = useState<ChatPetFace | null>(null);
  const petKey = stay ? stay.pets.map((p) => p.id).join(",") : "";
  useEffect(() => {
    let live = true;
    void loadChatPetMeta(petKey ? petKey.split(",") : []).then((m) => live && setMeta(m));
    return () => {
      live = false;
    };
  }, [petKey]);
  const faces: ChatPetFace[] = (stay?.pets ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    species: meta.get(p.id)?.species ?? p.species ?? null,
    photo: meta.get(p.id)?.photo ?? null,
  }));
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
        {faces.length > 0 ? <ChatPetRow pets={faces} onPressPet={setOpen} /> : null}
      </View>
      <Sheet visible={open !== null} title={open?.name ?? ""} onClose={() => setOpen(null)} testID="chat-pet-sheet">
        {open ? <PetGlance petId={open.id} bare emptyText="No details yet." testID={`chat-pet-glance-${open.name}`} /> : null}
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
