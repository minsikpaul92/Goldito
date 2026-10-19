import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { ChatListItem, previewOf } from "../features/chat/chatApi";
import { formatStamp } from "../features/schedule/dates";
import { useThemedStyles } from "../providers/ThemeProvider";
import { Theme } from "../theme/themes";
import { Avatar } from "./ui/Avatar";
import { SwipeToDelete } from "./ui/SwipeToDelete";

type Props = {
  items: ChatListItem[];
  onLeave: (threadId: string) => void;
};

/** "Oct 20" or the time of day: a short stamp for the list. */
function shortStamp(iso: string): string {
  return formatStamp(iso).replace(/^\w+,\s*/, "").replace(/,.*$/, "");
}

/** The chats, WhatsApp style: initial, name, last message, day and unread count. Swipe a row to leave the chat. */
export function ChatList({ items, onLeave }: Props) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.list} testID="chat-list">
      {items.map((chat) => (
        <SwipeToDelete key={chat.threadId} onDelete={() => onLeave(chat.threadId)} label="Leave" testID={`chat-row-${chat.otherName}-swipe`}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${chat.otherName}${chat.unread > 0 ? `, ${chat.unread} unread` : ""}`}
            onPress={() => router.push(`/chat/${chat.threadId}`)}
            style={styles.row}
            testID={`chat-row-${chat.otherName}`}
          >
            <Avatar kind="initial" name={chat.otherName} size={48} />
            <View style={styles.body}>
              <Text style={[styles.name, chat.unread > 0 && styles.bold]} numberOfLines={1}>
                {chat.otherName}
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
