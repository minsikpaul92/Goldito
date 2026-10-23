import { StyleSheet } from "react-native";

import { useMyChats } from "./useMyChats";
import { ChatList } from "../../components/ChatList";
import { EmptyState } from "../../components/ui/EmptyState";
import { LoadingView } from "../../components/ui/LoadingView";
import { Screen } from "../../components/ui/Screen";
import { useThemedStyles } from "../../providers/ThemeProvider";
import { Theme } from "../../theme/themes";

/**
 * The Chat tab (#329, Seulgi's five tabs): every chat of the signed-in owner or sitter, newest first. The newest chat
 * with something new for me is marked (#228). Swipe a row to leave the chat.
 */
export function ChatsTab({ emptyMessage }: { emptyMessage: string }) {
  const styles = useThemedStyles(makeStyles);
  const chats = useMyChats();
  if (!chats.loaded) return <LoadingView />;
  const newest = chats.items.filter((c) => c.unread > 0).sort((a, b) => b.lastAt.localeCompare(a.lastAt))[0] ?? null;
  return (
    <Screen contentStyle={styles.content} testID="chats-tab">
      {chats.items.length === 0 ? (
        <EmptyState emoji="✉️" title="No chats yet" message={emptyMessage} />
      ) : (
        <ChatList items={chats.items} onLeave={(id) => void chats.leave(id)} highlightId={newest?.threadId ?? null} />
      )}
    </Screen>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    content: { gap: theme.spacing.md },
  });
