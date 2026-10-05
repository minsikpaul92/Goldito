import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { formatFeedTime } from "../lib/feed";
import {
  AppNotification,
  deleteNotification,
  hrefForNotification,
  listNotifications,
  markNotificationRead,
} from "../lib/notifications";
import { useErrorDialog } from "../providers/ErrorDialogProvider";
import { useNotifications } from "../providers/NotificationsProvider";
import { useTheme, useThemedStyles } from "../providers/ThemeProvider";
import { Theme } from "../theme/themes";
import { SwipeToDelete } from "./ui/SwipeToDelete";
import { TextButton } from "./ui/TextButton";

/** What the sitter does during a stay — shown as live cards on the owner's Home. */
const LIVE_TYPES = new Set(["task_done", "care_checkin", "feed_post"]);
const SHOWN = 3;

const EMOJI: Record<string, string> = { task_done: "✅", care_checkin: "📝", feed_post: "📸" };

/**
 * Owner Home "Live updates": the latest few notices about the stay as cards. Swipe one away to dismiss
 * it (it leaves Home and the notification list; the record stays in History). Tap to open.
 */
export function LiveUpdates() {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const errorDialog = useErrorDialog();
  const { inboxRevision, refreshUnread } = useNotifications();
  const [items, setItems] = useState<AppNotification[] | null>(null);

  const load = useCallback(async () => {
    try {
      const all = await listNotifications();
      setItems(all.filter((n) => LIVE_TYPES.has(n.type)));
    } catch {
      setItems((prev) => prev ?? []);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );
  useEffect(() => {
    if (inboxRevision > 0) void load();
  }, [inboxRevision, load]);

  const dismiss = async (notice: AppNotification) => {
    setItems((prev) => (prev ?? []).filter((n) => n.id !== notice.id));
    try {
      await deleteNotification(notice.id);
      await refreshUnread();
    } catch (error) {
      void load();
      errorDialog.show({ title: "Couldn't dismiss", message: (error as Error).message });
    }
  };

  const open = async (notice: AppNotification) => {
    if (!notice.readAt) {
      try {
        await markNotificationRead(notice.id);
        await refreshUnread();
        setItems((prev) => (prev ?? []).map((n) => (n.id === notice.id ? { ...n, readAt: new Date().toISOString() } : n)));
      } catch {
        // Still open it.
      }
    }
    const href = hrefForNotification(notice, "owner");
    if (href) router.push(href);
  };

  const shown = (items ?? []).slice(0, SHOWN);
  const more = (items ?? []).length - shown.length;

  return (
    <View style={styles.root} testID="live-updates">
      <View style={styles.head}>
        <Text accessibilityRole="header" style={styles.heading}>
          Live updates
        </Text>
        <TextButton label="🕘 History" onPress={() => router.push("/owner/history")} testID="open-history" />
      </View>

      {items != null && shown.length === 0 ? (
        <Text style={styles.muted} testID="live-empty">
          Nothing new. During a stay, what your sitter does shows up here — swipe to dismiss.
        </Text>
      ) : null}

      {shown.map((n) => (
        <SwipeToDelete
          key={n.id}
          onDelete={() => void dismiss(n)}
          radius={theme.radius.md}
          testID={`live-swipe-${n.id}`}
        >
          <Pressable
            accessibilityRole="button"
            onPress={() => void open(n)}
            style={({ pressed }) => [styles.card, !n.readAt && styles.unread, pressed && styles.pressed]}
            testID={`live-${n.id}`}
          >
            <Text style={styles.emoji} accessibilityElementsHidden>
              {EMOJI[n.type] ?? "🐾"}
            </Text>
            <View style={styles.body}>
              <Text style={[styles.title, !n.readAt && styles.titleUnread]}>{n.title}</Text>
              {n.body ? <Text style={styles.memo}>{n.body}</Text> : null}
              <Text style={styles.time}>{formatFeedTime(n.createdAt)}</Text>
            </View>
          </Pressable>
        </SwipeToDelete>
      ))}

      {more > 0 ? (
        <TextButton
          label={`${more} more in notifications`}
          onPress={() => router.push("/owner/notifications")}
          testID="live-more"
        />
      ) : null}
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    root: { gap: theme.spacing.xs },
    head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    heading: { fontSize: theme.fontSize.body, fontWeight: "700", color: theme.color.text },
    muted: { fontSize: theme.fontSize.small, color: theme.color.textMuted },
    card: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.sm,
      padding: theme.spacing.sm,
      borderRadius: theme.radius.md,
      borderWidth: 1,
      borderColor: theme.color.border,
      backgroundColor: theme.color.surface,
    },
    unread: { backgroundColor: theme.color.accent },
    pressed: { opacity: 0.85 },
    emoji: { fontSize: 22 },
    body: { flex: 1, gap: 2 },
    title: { fontSize: theme.fontSize.body, color: theme.color.text },
    titleUnread: { fontWeight: "700" },
    memo: { fontSize: theme.fontSize.body, color: theme.color.text },
    time: { fontSize: theme.fontSize.small, color: theme.color.textMuted },
  });
