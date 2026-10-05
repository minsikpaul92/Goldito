import { useFocusEffect, router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";

import { Button } from "../../components/ui/Button";
import { EmptyState } from "../../components/ui/EmptyState";
import { LoadingView } from "../../components/ui/LoadingView";
import { Sheet } from "../../components/ui/Sheet";
import { SwipeToDelete } from "../../components/ui/SwipeToDelete";
import { TextButton } from "../../components/ui/TextButton";
import { formatFeedTime } from "../../lib/feed";
import {
  AppNotification,
  deleteAllNotifications,
  deleteNotification,
  hrefForNotification,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "../../lib/notifications";
import { useErrorDialog } from "../../providers/ErrorDialogProvider";
import { useNotifications } from "../../providers/NotificationsProvider";
import { Role, useSession } from "../../providers/SessionProvider";
import { useThemedStyles } from "../../providers/ThemeProvider";
import { Theme } from "../../theme/themes";

type ListState =
  | { status: "loading" }
  | { status: "ready"; items: AppNotification[] }
  | { status: "error"; message: string; items: AppNotification[] };

/**
 * Shared notification center UI for `/owner/notifications` and `/sitter/notifications` (5.5).
 * Tap → mark read + navigate (architecture §7). Empty: "You're all caught up."
 */
export function NotificationsCenter({ role }: { role: Role }) {
  const styles = useThemedStyles(makeStyles);
  const session = useSession();
  const { inboxRevision, refreshUnread, unreadCount } = useNotifications();
  const [list, setList] = useState<ListState>({ status: "loading" });
  const [markingAll, setMarkingAll] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [clearing, setClearing] = useState(false);
  const errorDialog = useErrorDialog();

  const load = useCallback(async (soft = false) => {
    if (!soft) setList({ status: "loading" });
    try {
      const items = await listNotifications();
      setList({ status: "ready", items });
    } catch (error) {
      setList((prev) => ({
        status: "error",
        message: (error as Error).message,
        items: prev.status === "ready" || prev.status === "error" ? prev.items : [],
      }));
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load(false);
    }, [load]),
  );

  // Soft refresh when a new Realtime notice arrives while this screen is open.
  useEffect(() => {
    if (inboxRevision === 0) return;
    void load(true);
  }, [inboxRevision, load]);

  const onMarkAll = async () => {
    if (markingAll || unreadCount === 0) return;
    setMarkingAll(true);
    try {
      await markAllNotificationsRead();
      await refreshUnread();
      setList((prev) => {
        if (prev.status === "loading") return prev;
        const now = new Date().toISOString();
        return {
          status: "ready",
          items: prev.items.map((n) => (n.readAt ? n : { ...n, readAt: now })),
        };
      });
    } catch {
      // Keep the list; user can retry.
    } finally {
      setMarkingAll(false);
    }
  };

  const dropFromList = (shouldDrop: (n: AppNotification) => boolean) =>
    setList((prev) =>
      prev.status === "loading" ? prev : { ...prev, status: "ready", items: prev.items.filter((n) => !shouldDrop(n)) },
    );

  /** Swiped away: it leaves the list at once; if the delete fails it comes back with a message. */
  const onDelete = async (notice: AppNotification) => {
    dropFromList((n) => n.id === notice.id);
    try {
      await deleteNotification(notice.id);
      await refreshUnread();
    } catch (error) {
      void load(true);
      errorDialog.show({ title: "Couldn't delete", message: (error as Error).message });
    }
  };

  const onClearAll = async () => {
    if (clearing) return;
    setClearing(true);
    try {
      await deleteAllNotifications();
      setConfirmClear(false);
      dropFromList(() => true);
      await refreshUnread();
    } catch (error) {
      setConfirmClear(false);
      errorDialog.show({ title: "Couldn't clear", message: (error as Error).message });
    } finally {
      setClearing(false);
    }
  };

  const onOpen = async (notice: AppNotification) => {
    if (!notice.readAt) {
      try {
        await markNotificationRead(notice.id);
        await refreshUnread();
        setList((prev) => {
          if (prev.status === "loading") return prev;
          const now = new Date().toISOString();
          return {
            ...prev,
            status: "ready",
            items: prev.items.map((n) => (n.id === notice.id ? { ...n, readAt: now } : n)),
          };
        });
      } catch {
        // Still try to navigate.
      }
    }
    const href = hrefForNotification(notice, role);
    if (href) router.push(href);
  };

  if (session.status === "loading") return <LoadingView />;

  if (list.status === "loading") return <LoadingView />;

  const items = list.status === "ready" || list.status === "error" ? list.items : [];

  if (list.status === "error" && items.length === 0) {
    return (
      <EmptyState
        emoji="🔔"
        title="Couldn't load notifications"
        message={list.message}
        action={{ label: "Try again", onPress: () => void load(false) }}
      />
    );
  }

  if (items.length === 0) {
    return (
      <EmptyState emoji="✅" title="You're all caught up." message="New updates from your stay will show up here." />
    );
  }

  return (
    <View style={styles.root} testID="notifications-center">
      <View style={styles.toolbar}>
        {unreadCount > 0 ? (
          <TextButton
            label={markingAll ? "Marking…" : "Mark all as read"}
            onPress={() => void onMarkAll()}
            disabled={markingAll}
            testID="mark-all-read"
          />
        ) : null}
        <TextButton label="Clear all" danger onPress={() => setConfirmClear(true)} testID="clear-all" />
      </View>
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <SwipeToDelete onDelete={() => void onDelete(item)} testID={`notification-swipe-${item.id}`}>
            <Pressable
              accessibilityRole="button"
              onPress={() => void onOpen(item)}
              style={({ pressed }) => [styles.row, pressed && styles.pressed, !item.readAt && styles.unread]}
              testID={`notification-${item.id}`}
            >
              <View style={styles.rowBody}>
                {!item.readAt ? <View style={styles.dot} /> : <View style={styles.dotSpacer} />}
                <View style={styles.textCol}>
                  <Text style={[styles.title, !item.readAt && styles.titleUnread]}>{item.title}</Text>
                  {item.body ? <Text style={styles.body}>{item.body}</Text> : null}
                  <Text style={styles.time}>{formatFeedTime(item.createdAt)}</Text>
                </View>
              </View>
            </Pressable>
          </SwipeToDelete>
        )}
      />
      <Sheet
        visible={confirmClear}
        title="Clear all notifications?"
        onClose={() => {
          if (!clearing) setConfirmClear(false);
        }}
        testID="clear-all-sheet"
        footer={
          <Button
            label={clearing ? "Clearing…" : `Clear ${items.length} notification${items.length === 1 ? "" : "s"}`}
            disabled={clearing}
            onPress={() => void onClearAll()}
            testID="clear-all-confirm"
          />
        }
      >
        <Text style={styles.title}>They leave this list for good. What your sitter did stays in History.</Text>
      </Sheet>
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: theme.color.background,
    },
    toolbar: {
      flexDirection: "row",
      justifyContent: "flex-end",
      alignItems: "center",
      paddingHorizontal: theme.spacing.sm,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.color.border,
      backgroundColor: theme.color.surface,
    },
    list: {
      paddingBottom: theme.spacing.xl,
    },
    row: {
      paddingVertical: theme.spacing.md,
      paddingHorizontal: theme.spacing.md,
      backgroundColor: theme.color.surface,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.color.border,
    },
    unread: {
      backgroundColor: theme.color.accent,
    },
    pressed: {
      opacity: 0.85,
    },
    rowBody: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: theme.spacing.sm,
    },
    dot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      marginTop: 6,
      backgroundColor: theme.color.primary,
    },
    dotSpacer: {
      width: 8,
      height: 8,
      marginTop: 6,
    },
    textCol: {
      flex: 1,
      gap: 2,
    },
    title: {
      fontSize: theme.fontSize.body,
      color: theme.color.text,
    },
    titleUnread: {
      fontWeight: "600",
    },
    body: {
      fontSize: theme.fontSize.small,
      color: theme.color.textMuted,
    },
    time: {
      marginTop: 2,
      fontSize: theme.fontSize.caption,
      color: theme.color.textMuted,
    },
  });
