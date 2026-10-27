import { useFocusEffect, router } from "expo-router";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";

import { NoticeDetail, NoticeThumb } from "../../components/NoticeDetail";
import { Button } from "../../components/ui/Button";
import { EmptyState } from "../../components/ui/EmptyState";
import { Icon } from "../../components/ui/Icon";
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
import { DETAIL_TYPES, detailNextLabel, useNoticeMedia } from "./noticeMedia";
import { NoticeEntry, NoticeTone, checkinFoldTitle, checkinSummary, groupNotices, noticeAction, noticeIcon, plainText } from "./noticeDisplay";
import { useErrorDialog } from "../../providers/ErrorDialogProvider";
import { useNotifications } from "../../providers/NotificationsProvider";
import { Role, useSession } from "../../providers/SessionProvider";
import { useTheme, useThemedStyles } from "../../providers/ThemeProvider";
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
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const session = useSession();
  const { inboxRevision, refreshUnread, unreadCount } = useNotifications();
  const [list, setList] = useState<ListState>({ status: "loading" });
  const [markingAll, setMarkingAll] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [clearing, setClearing] = useState(false);
  const errorDialog = useErrorDialog();
  const noticeMedia = useNoticeMedia(list.status === "loading" ? null : list.items);
  const [detail, setDetail] = useState<AppNotification | null>(null);
  const [openFolds, setOpenFolds] = useState<Set<string>>(new Set());
  const days = useMemo(() => groupNotices(list.status === "loading" ? [] : list.items), [list]);

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
    if (DETAIL_TYPES.has(notice.type) && (noticeMedia[notice.id] || notice.body)) {
      setDetail(notice);
      return;
    }
    const href = hrefForNotification(notice, role);
    if (href) router.push(href);
  };

  const goFromDetail = () => {
    const notice = detail;
    setDetail(null);
    const href = notice ? hrefForNotification(notice, role) : null;
    if (href) router.push(href);
  };

  const toggleFold = (key: string) =>
    setOpenFolds((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  /** One notice: its drawn icon, the words without emoji, a photo or the word for what to do, swipe to delete. */
  const renderRow = (item: AppNotification) => {
    const media = noticeMedia[item.id];
    const { icon, tone } = noticeIcon(item);
    const action = media ? null : noticeAction(item.type, role);
    const sub = [item.body ? plainText(item.body) : null, formatFeedTime(item.createdAt)].filter(Boolean).join(" · ");
    return (
      <SwipeToDelete key={item.id} onDelete={() => void onDelete(item)} radius={theme.radius.md} testID={`notification-swipe-${item.id}`}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${item.readAt ? "" : "Unread. "}${plainText(item.title)}. ${sub}`}
          onPress={() => void onOpen(item)}
          style={({ pressed }) => [styles.row, !item.readAt && styles.unread, pressed && styles.pressed]}
          testID={`notification-${item.id}`}
        >
          <IconSquare icon={icon} tone={tone} unread={!item.readAt} />
          <View style={styles.textCol}>
            <Text style={[styles.title, !item.readAt && styles.titleUnread]}>{plainText(item.title)}</Text>
            <Text style={styles.sub} numberOfLines={2}>
              {sub}
            </Text>
          </View>
          {media ? <NoticeThumb media={media} size={44} /> : null}
          {action ? (
            <View style={styles.action}>
              <Text style={styles.actionText}>{action}</Text>
            </View>
          ) : null}
        </Pressable>
      </SwipeToDelete>
    );
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
      <EmptyState
        emoji="🔔"
        title="You're all caught up."
        message="New updates from your stay will show up here."
        action={role === "owner" ? { label: "History", onPress: () => router.push("/owner/history") } : undefined}
      />
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
        {role === "owner" ? <TextButton label="History" onPress={() => router.push("/owner/history")} testID="open-history" /> : null}
        <TextButton label="Clear all" danger onPress={() => setConfirmClear(true)} testID="clear-all" />
      </View>
      <FlatList
        data={days}
        keyExtractor={(d) => d.day}
        contentContainerStyle={styles.list}
        renderItem={({ item: day }) => (
          <View style={styles.dayWrap} testID={`notice-day-${day.day}`}>
            <Text style={styles.dayLabel} accessibilityRole="header">
              {day.label}
            </Text>
            <View style={styles.dayCard}>
              {day.entries.map((entry, i) => (
                <Fragment key={entryKey(entry)}>
                  {i > 0 && isRead(day.entries[i - 1]) && isRead(entry) ? <View style={styles.divider} /> : null}
                  {entry.kind === "one" ? (
                    renderRow(entry.notice)
                  ) : (
                    <View style={styles.fold}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityState={{ expanded: openFolds.has(entry.key) }}
                        accessibilityHint="Shows each check-in"
                        onPress={() => toggleFold(entry.key)}
                        style={({ pressed }) => [styles.row, !isRead(entry) && styles.unread, pressed && styles.pressed]}
                        testID={`notification-fold-${entry.key}`}
                      >
                        <IconSquare icon="check" tone="butter" unread={!isRead(entry)} />
                        <View style={styles.textCol}>
                          <Text style={[styles.title, !isRead(entry) && styles.titleUnread]} numberOfLines={1}>
                            {checkinFoldTitle(entry.notices)}
                          </Text>
                          <Text style={styles.sub} numberOfLines={1}>
                            {checkinSummary(entry.notices)} · {formatFeedTime(entry.notices[0].createdAt)}
                          </Text>
                        </View>
                        <View style={openFolds.has(entry.key) ? styles.chevronOpen : null}>
                          <Icon name="expand" size={20} color={theme.color.textMuted} />
                        </View>
                      </Pressable>
                      {openFolds.has(entry.key) ? <View style={styles.foldItems}>{entry.notices.map((n) => renderRow(n))}</View> : null}
                    </View>
                  )}
                </Fragment>
              ))}
            </View>
          </View>
        )}
      />
      <NoticeDetail
        notice={detail}
        media={detail ? (noticeMedia[detail.id] ?? null) : null}
        next={detail ? detailNextLabel(detail.type, role) : ""}
        onClose={() => setDetail(null)}
        onNext={goFromDetail}
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
      padding: theme.spacing.md,
      gap: theme.spacing.md,
      paddingBottom: theme.spacing.xl,
    },
    dayWrap: { gap: theme.spacing.sm },
    dayLabel: {
      paddingHorizontal: theme.spacing.xs,
      fontSize: theme.fontSize.caption + 1,
      fontWeight: theme.fontWeight.bold,
      letterSpacing: 0.6,
      textTransform: "uppercase",
      color: theme.color.textMuted,
    },
    // One card per day; rows inside keep their own room and shape, so unread rows never run into each other.
    dayCard: {
      padding: theme.spacing.xs + 2,
      gap: theme.spacing.xs + 2,
      borderRadius: theme.radius.lg,
      borderWidth: 1,
      borderColor: theme.color.border,
      backgroundColor: theme.color.surface,
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.sm + theme.spacing.xs,
      minHeight: theme.layout.touchTarget + theme.spacing.md,
      paddingVertical: theme.spacing.sm + theme.spacing.xs,
      paddingHorizontal: theme.spacing.sm + theme.spacing.xs,
      borderRadius: theme.radius.md,
      backgroundColor: theme.color.surface,
    },
    unread: {
      backgroundColor: theme.color.accent,
    },
    pressed: {
      opacity: theme.opacity.pressed,
    },
    // A hairline only between two read rows; unread rows are set apart by their tint.
    divider: {
      height: StyleSheet.hairlineWidth,
      marginHorizontal: theme.spacing.sm + theme.spacing.xs,
      backgroundColor: theme.color.border,
    },
    fold: { gap: theme.spacing.xs + 2 },
    foldItems: { gap: theme.spacing.xs + 2, paddingLeft: theme.spacing.md },
    chevronOpen: { transform: [{ rotate: "180deg" }] },
    textCol: {
      flex: 1,
      minWidth: 0,
      gap: 2,
    },
    title: {
      fontSize: theme.fontSize.small + 1,
      lineHeight: theme.lineHeight.small,
      color: theme.color.text,
    },
    titleUnread: {
      fontWeight: theme.fontWeight.semibold,
    },
    sub: {
      fontSize: theme.fontSize.small - 1,
      lineHeight: 18,
      color: theme.color.textMuted,
    },
    action: {
      minHeight: 28,
      justifyContent: "center",
      paddingHorizontal: theme.spacing.sm + 2,
      borderRadius: theme.radius.pill,
      borderWidth: 1.5,
      borderColor: theme.color.text,
      backgroundColor: theme.color.surface,
    },
    actionText: {
      fontSize: theme.fontSize.small - 1,
      fontWeight: theme.fontWeight.semibold,
      color: theme.color.text,
    },
    square: {
      width: 36,
      height: 36,
      borderRadius: theme.radius.sm + 2,
      alignItems: "center",
      justifyContent: "center",
    },
  });

const TONE: Record<NoticeTone, "blockMint" | "blockPeach" | "blockButter" | "blockBlush"> = {
  mint: "blockMint",
  peach: "blockPeach",
  butter: "blockButter",
  blush: "blockBlush",
};

/** The drawn icon in its tinted square; on a mint (unread) row a mint square turns white so it still shows. */
function IconSquare({ icon, tone, unread }: { icon: ReturnType<typeof noticeIcon>["icon"]; tone: NoticeTone; unread: boolean }) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const ground = theme.color[TONE[tone]];
  const background = unread && ground.toLowerCase() === theme.color.accent.toLowerCase() ? theme.color.surface : ground;
  return (
    <View style={[styles.square, { backgroundColor: background }]}>
      <Icon name={icon} size={20} color={theme.color.text} />
    </View>
  );
}

const entryKey = (e: NoticeEntry) => (e.kind === "one" ? e.notice.id : `fold-${e.key}`);

const isRead = (e: NoticeEntry) => (e.kind === "one" ? !!e.notice.readAt : e.notices.every((n) => n.readAt));
