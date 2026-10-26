import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { ChatListItem, previewOf } from "../features/chat/chatApi";
import { ProfilePhoto, loadCoverPhotos, photoThumb } from "../features/profile/profilePhotosApi";
import { formatStamp } from "../features/schedule/dates";
import { useThemedStyles } from "../providers/ThemeProvider";
import { Theme } from "../theme/themes";
import { Avatar } from "./ui/Avatar";
import { SwipeToDelete } from "./ui/SwipeToDelete";

type Props = {
  items: ChatListItem[];
  onLeave: (threadId: string) => void;
  /** The chat to point at (the newest one with something new for me, #228): an accent bar and a tinted row. */
  highlightId?: string | null;
  /** The sitter's list names the owner's pets of the stay ("Peter · Biscuit, Luna"); the owner's does not. */
  showPets?: boolean;
};

/** "Oct 20" or the time of day: a short stamp for the list. */
function shortStamp(iso: string): string {
  return formatStamp(iso).replace(/^\w+,\s*/, "").replace(/,.*$/, "");
}

/** The chats, WhatsApp style: initial, name, last message, day and unread count. Swipe a row to leave the chat. */
export function ChatList({ items, onLeave, highlightId, showPets }: Props) {
  const styles = useThemedStyles(makeStyles);
  // The other person's photo, when they have one; the initial circle otherwise.
  const [covers, setCovers] = useState<Map<string, ProfilePhoto>>(new Map());
  const otherIds = items.map((c) => c.otherId).join(",");
  useEffect(() => {
    let live = true;
    void loadCoverPhotos(otherIds ? otherIds.split(",") : []).then((m) => live && setCovers(m));
    return () => {
      live = false;
    };
  }, [otherIds]);
  return (
    <View style={styles.list} testID="chat-list">
      {items.map((chat) => (
        <SwipeToDelete key={chat.threadId} onDelete={() => onLeave(chat.threadId)} label="Leave" testID={`chat-row-${chat.otherName}-swipe`}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${chat.otherName}${chat.unread > 0 ? `, ${chat.unread} unread` : ""}`}
            onPress={() => router.push(`/chat/${chat.threadId}`)}
            style={[styles.row, chat.threadId === highlightId && styles.highlight]}
            testID={`chat-row-${chat.otherName}`}
          >
            {chat.threadId === highlightId ? <View style={styles.bar} testID={`chat-row-${chat.otherName}-new`} /> : null}
            {covers.get(chat.otherId) ? (
              <Avatar kind="photo" uri={photoThumb(covers.get(chat.otherId) as ProfilePhoto, 144)} size={48} testID={`chat-row-${chat.otherName}-photo`} />
            ) : (
              <Avatar kind="initial" name={chat.otherName} size={48} />
            )}
            <View style={styles.body}>
              <Text style={[styles.name, chat.unread > 0 && styles.bold]} numberOfLines={1}>
                {showPets && chat.pets.length > 0 ? `${chat.otherName} · ${chat.pets.map((p) => p.name).join(", ")}` : chat.otherName}
              </Text>
              <Text style={[styles.preview, chat.unread > 0 && styles.bold]} numberOfLines={1}>
                {previewOf(chat)}
              </Text>
            </View>
            <View style={styles.side}>
              <Text style={styles.time}>{shortStamp(chat.lastAt)}</Text>
              {chat.unread > 0 ? (
                <View style={styles.badge} testID={`chat-unread-${chat.otherName}`}>
                  <Text style={styles.badgeText}>{chat.unread}</Text>
                </View>
              ) : null}
            </View>
          </Pressable>
        </SwipeToDelete>
      ))}
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    list: { gap: theme.spacing.xs },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.md,
      paddingVertical: theme.spacing.sm,
      backgroundColor: theme.color.background,
    },
    highlight: { backgroundColor: theme.color.accent, borderRadius: theme.radius.md, paddingRight: theme.spacing.sm },
    bar: { width: 4, alignSelf: "stretch", borderRadius: 2, backgroundColor: theme.color.primary },
    body: { flex: 1, gap: 2 },
    name: { fontSize: theme.fontSize.body, color: theme.color.text },
    preview: { fontSize: theme.fontSize.small, color: theme.color.textMuted },
    bold: { fontWeight: theme.fontWeight.bold, color: theme.color.text },
    side: { alignItems: "flex-end", gap: 4 },
    time: { fontSize: theme.fontSize.small, color: theme.color.textMuted },
    badge: {
      minWidth: 22,
      height: 22,
      borderRadius: 11,
      paddingHorizontal: 6,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.color.primary,
    },
    badgeText: { fontSize: 12, fontWeight: theme.fontWeight.bold, color: theme.color.primaryText },
  });
