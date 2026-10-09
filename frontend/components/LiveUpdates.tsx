import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { listOpenCounterIds } from "../features/care/carePlanApi";
import { listReviewedBookingIds } from "../features/completion/completionApi";
import { DETAIL_TYPES, detailNextLabel, useNoticeMedia } from "../features/notifications/noticeMedia";
import { formatFeedTime } from "../lib/feed";
import {
  AppNotification,
  deleteNotification,
  deleteNotifications,
  hrefForNotification,
  listNotifications,
  markNotificationRead,
} from "../lib/notifications";
import { useErrorDialog } from "../providers/ErrorDialogProvider";
import { useNotifications } from "../providers/NotificationsProvider";
import { useTheme, useThemedStyles } from "../providers/ThemeProvider";
import { Theme } from "../theme/themes";
import { NoticeDetail, NoticeThumb } from "./NoticeDetail";
import { SwipeToDelete } from "./ui/SwipeToDelete";
import { TextButton } from "./ui/TextButton";

/** What the sitter does during a stay — shown as live cards on the owner's Home (the daily report too, FB-21). */
const LIVE_TYPES = new Set([
  "report_sent",
  "review_requested",
  "task_done",
  "care_checkin",
  "feed_post",
  "care_request_approved",
  "care_request_declined",
  "care_request_countered",
]);
const SHOWN = 3;

const EMOJI: Record<string, string> = {
  report_sent: "📓",
  review_requested: "⭐",
  task_done: "✅",
  care_checkin: "📝",
  feed_post: "📸",
  care_request_approved: "✅",
  care_request_declined: "⚠️",
  care_request_countered: "💬",
};

/**
 * What Home keeps showing: anything unread, and a counter-request until the owner has answered it.
 * Opened ("read") updates leave Home — they stay in the notification list and in History.
 * Pinned ones (an unread decline, an unanswered counter-request, a stay still waiting for its review — FB-24)
 * can't be swiped away.
 */
const pinnedFor = (open: ReadonlySet<string>, reviewed: ReadonlySet<string>) => (n: AppNotification) =>
  (n.type === "care_request_declined" && !n.readAt) ||
  (n.type === "care_request_countered" && !!n.refId && open.has(n.refId)) ||
  (n.type === "review_requested" && !!n.bookingId && !reviewed.has(n.bookingId));

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
  const [openCounters, setOpenCounters] = useState<ReadonlySet<string>>(new Set());
  const [reviewed, setReviewed] = useState<ReadonlySet<string>>(new Set());
  const pinned = pinnedFor(openCounters, reviewed);
  const media = useNoticeMedia(items);
  const [detail, setDetail] = useState<AppNotification | null>(null);

  const load = useCallback(async () => {
    try {
      const [all, counters, reviews] = await Promise.all([
        listNotifications(),
        listOpenCounterIds().catch(() => [] as string[]),
        listReviewedBookingIds().catch(() => [] as string[]),
      ]);
      const open = new Set(counters);
      const done = new Set(reviews);
      const isPinned = pinnedFor(open, done);
      // A review request goes away once that stay is reviewed, read or not.
      const live = all.filter(
        (n) => LIVE_TYPES.has(n.type) && (!n.readAt || isPinned(n)) && !(n.type === "review_requested" && n.bookingId && done.has(n.bookingId)),
      );
      setOpenCounters(open);
      setReviewed(done);
      setItems([...live.filter(isPinned), ...live.filter((n) => !isPinned(n))]);
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

  const [confirmingClear, setConfirmingClear] = useState(false);
  const clearAll = async () => {
    const ids = new Set((items ?? []).filter((n) => !pinned(n)).map((n) => n.id)); // unread answers stay
    setItems((prev) => (prev ?? []).filter(pinned));
    setConfirmingClear(false);
    try {
      await deleteNotifications([...ids]);
      await refreshUnread();
    } catch (error) {
      void load();
      errorDialog.show({ title: "Couldn't clear", message: (error as Error).message });
    }
  };

  const open = async (notice: AppNotification) => {
    if (!notice.readAt) {
      try {
        await markNotificationRead(notice.id);
        await refreshUnread();
        // Opened = seen: it leaves Home (a counter-request stays until it is answered).
        setItems((prev) =>
          (prev ?? []).flatMap((n) => {
            if (n.id !== notice.id) return [n];
            const seen = { ...n, readAt: new Date().toISOString() };
            return pinned(seen) ? [seen] : [];
          }),
        );
      } catch {
        // Still open it.
      }
    }
    // A photo and/or a memo opens big first; closing it carries on to History / Feed.
    if (DETAIL_TYPES.has(notice.type) && (media[notice.id] || notice.body)) {
      setDetail(notice);
      return;
    }
    const href = hrefForNotification(notice, "owner");
    if (href) router.push(href);
  };

  const goFromDetail = () => {
    const notice = detail;
    setDetail(null);
    const href = notice ? hrefForNotification(notice, "owner") : null;
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

      {confirmingClear ? (
        <View style={styles.clearRow}>
          <TextButton label="Clear all" onPress={() => void clearAll()} testID="live-clear-all" />
          <TextButton label="Cancel" onPress={() => setConfirmingClear(false)} testID="live-clear-cancel" />
        </View>
      ) : null}

      {shown.map((n, index) => {
        const isPinned = pinned(n);
        const card = (
          <Pressable
            accessibilityRole="button"
            onPress={() => void open(n)}
            style={({ pressed }) => [
              styles.card,
              !n.readAt && styles.unread,
              isPinned && styles.pinned,
              pressed && styles.pressed,
            ]}
            testID={`live-${n.id}`}
          >
            <Text style={styles.emoji} accessibilityElementsHidden>
              {EMOJI[n.type] ?? "🐾"}
            </Text>
            <View style={styles.body}>
              <Text style={[styles.title, !n.readAt && styles.titleUnread]}>{n.title}</Text>
              {n.body ? (
                <Text style={styles.memo} numberOfLines={isPinned ? 2 : undefined}>
                  {n.body}
                </Text>
              ) : null}
              {isPinned ? <Text style={styles.pinHint}>Tap to read and answer</Text> : null}
              <Text style={styles.time}>{formatFeedTime(n.createdAt)}</Text>
            </View>
            {media[n.id] ? <NoticeThumb media={media[n.id]} /> : null}
          </Pressable>
        );
        return (
        <View key={n.id} style={styles.cardWrap} testID={isPinned ? `live-pinned-${n.id}` : undefined}>
        {isPinned ? (
          card
        ) : (
          <SwipeToDelete onDelete={() => void dismiss(n)} radius={theme.radius.md} testID={`live-swipe-${n.id}`}>
            {card}
          </SwipeToDelete>
        )}
        {index === 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Clear updates"
            hitSlop={6}
            onPress={() => setConfirmingClear((v) => !v)}
            style={styles.x}
            testID="live-x"
          >
            <Text style={styles.xText}>✕</Text>
          </Pressable>
        ) : null}
        </View>
        );
      })}

      {more > 0 ? (
        <TextButton
          label={`${more} more in notifications`}
          onPress={() => router.push("/owner/notifications")}
          testID="live-more"
        />
      ) : null}
      <NoticeDetail
        notice={detail}
        media={detail ? (media[detail.id] ?? null) : null}
        next={detail ? detailNextLabel(detail.type, "owner") : ""}
        onClose={() => setDetail(null)}
        onNext={goFromDetail}
      />
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
    pinned: { borderWidth: 2, borderColor: theme.color.warning },
    pinHint: { fontSize: theme.fontSize.small, fontWeight: "700", color: theme.color.warning },
    pressed: { opacity: 0.85 },
    clearRow: { flexDirection: "row", justifyContent: "flex-end", gap: theme.spacing.sm, marginBottom: -theme.spacing.xs },
    cardWrap: { position: "relative" },
    // Sits on the card's top-right corner, half outside the border.
    x: {
      position: "absolute",
      top: -10,
      right: -8,
      zIndex: 2,
      width: 24,
      height: 24,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: theme.color.border,
      backgroundColor: theme.color.surface,
    },
    xText: { fontSize: 12, fontWeight: "700", color: theme.color.textMuted },
    emoji: { fontSize: 22 },
    body: { flex: 1, gap: 2 },
    title: { fontSize: theme.fontSize.body, color: theme.color.text },
    titleUnread: { fontWeight: "700" },
    memo: { fontSize: theme.fontSize.body, color: theme.color.text },
    time: { fontSize: theme.fontSize.small, color: theme.color.textMuted },
  });
