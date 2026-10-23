import { router } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { StayToday } from "../../features/care/useStayToday";
import { useNoticeMedia } from "../../features/notifications/noticeMedia";
import { formatTime, isoToZoned } from "../../features/schedule/dates";
import { AppNotification, hrefForNotification, listNotifications } from "../../lib/notifications";
import { useNotifications } from "../../providers/NotificationsProvider";
import { useThemedStyles } from "../../providers/ThemeProvider";
import { Theme } from "../../theme/themes";
import { NoticeThumb } from "../NoticeDetail";
import { HOME_TEXT } from "./homeType";

/** What the sitter did, as one line: the same notices Live updates shows. */
const SITTER_TYPES = new Set(["task_done", "care_checkin", "feed_post", "report_sent", "photo_request_fulfilled"]);

/** Notice type to the History entry it is about (`diaryApi` ids): a photo opens big instead of landing on the list. */
const ENTRY_PREFIX: Record<string, string> = { task_done: "task", care_checkin: "checkin", feed_post: "feed" };

function whereTo(n: AppNotification) {
  const prefix = ENTRY_PREFIX[n.type];
  if (prefix && n.refId && n.petId) return `/owner/history?pet=${n.petId}&entry=${prefix}-${n.refId}` as const;
  return hrefForNotification(n, "owner") ?? "/owner/history";
}

/** Owner Home: the newest thing the sitter did for these pets (Figma "block.w"). Tap opens what it is about (the photo, in History). */
export function LatestCard({ stay }: { stay: StayToday }) {
  const styles = useThemedStyles(makeStyles);
  const { inboxRevision } = useNotifications();
  const [latest, setLatest] = useState<AppNotification | null>(null);
  const petKey = stay.pets.map((p) => p.id).join(",");

  const load = useCallback(async () => {
    try {
      const ids = new Set(petKey.split(","));
      const all = await listNotifications();
      setLatest(all.find((n) => SITTER_TYPES.has(n.type) && n.petId != null && ids.has(n.petId)) ?? null);
    } catch {
      // A bonus card: Home works without it.
    }
  }, [petKey]);

  useEffect(() => {
    void load();
  }, [load, inboxRevision]);

  const items = useMemo(() => (latest ? [latest] : null), [latest]);
  const media = useNoticeMedia(items);
  if (!latest) return null;

  const time = formatTime(isoToZoned(latest.createdAt).time);
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push(whereTo(latest))}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      testID="latest-update"
    >
      {media[latest.id] ? <NoticeThumb media={media[latest.id]} size={64} /> : null}
      <View style={styles.body}>
        <Text style={styles.kicker}>{`Latest from ${stay.sitterName} · ${time}`}</Text>
        <Text style={styles.text} numberOfLines={3}>
          <Text style={styles.strong}>{latest.title}</Text>
          {latest.body ? ` ${latest.body}` : ""}
        </Text>
      </View>
    </Pressable>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    card: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderRadius: 28, backgroundColor: theme.color.surface },
    pressed: { opacity: 0.85 },
    body: { flex: 1, gap: 2 },
    kicker: { fontSize: HOME_TEXT.kicker, lineHeight: 15.4, fontWeight: theme.fontWeight.bold, letterSpacing: 0.66, textTransform: "uppercase", color: theme.color.textMuted },
    text: { fontSize: HOME_TEXT.body, lineHeight: 17.5, color: theme.color.text },
    strong: { fontWeight: theme.fontWeight.bold },
  });
