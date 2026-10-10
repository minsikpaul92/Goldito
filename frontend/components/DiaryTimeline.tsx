import { useMemo, useState } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";

import { DiaryEntry } from "../features/diary/diaryApi";
import { addDays, appToday, formatDay, formatTime, isoToZoned } from "../features/schedule/dates";
import { deliveryUrl, thumbUrl, videoPosterUrl } from "../lib/cloudinary";
import { useThemedStyles } from "../providers/ThemeProvider";
import { Theme } from "../theme/themes";
import { Sheet } from "./ui/Sheet";

function dayTitle(day: string): string {
  const today = appToday();
  if (day === today) return "Today";
  if (day === addDays(today, -1)) return "Yesterday";
  return formatDay(day);
}

function thumbOf(entry: DiaryEntry, size: number): string | null {
  if (!entry.media) return null;
  return entry.media.resourceType === "video"
    ? videoPosterUrl(entry.media.publicId, size)
    : thumbUrl(entry.media.publicId, size);
}

/**
 * What happened, newest first, grouped Today / Yesterday / date. A row with a photo or memo opens a
 * detail sheet. Shared by the owner's History and the sitter's "what I sent".
 */
export function DiaryTimeline({ entries }: { entries: DiaryEntry[] }) {
  const styles = useThemedStyles(makeStyles);
  const [open, setOpen] = useState<DiaryEntry | null>(null);

  const days = useMemo(() => {
    const groups = new Map<string, DiaryEntry[]>();
    for (const entry of entries) {
      const day = isoToZoned(entry.at).day;
      groups.set(day, [...(groups.get(day) ?? []), entry]);
    }
    return [...groups.entries()];
  }, [entries]);

  const who = (entry: DiaryEntry) => [entry.by, entry.petName].filter(Boolean).join(" · ");

  return (
    <>
      {days.map(([day, list]) => (
        <View key={day} style={styles.day} testID={`diary-day-${day}`}>
          <Text accessibilityRole="header" style={styles.dayTitle}>
            {dayTitle(day)}
          </Text>
          {list.map((entry) => {
            const thumb = thumbOf(entry, 160);
            return (
              <Pressable
                key={entry.id}
                accessibilityRole="button"
                onPress={() => setOpen(entry)}
                style={({ pressed }) => [styles.row, entry.missed && styles.missed, pressed && styles.pressed]}
                testID={`diary-entry-${entry.id}`}
              >
                <Text style={styles.emoji} accessibilityElementsHidden>
                  {entry.emoji}
                </Text>
                <View style={styles.body}>
                  <Text style={styles.label}>{entry.label}</Text>
                  {entry.memo ? (
                    <Text style={styles.memo} numberOfLines={entry.kind === "report" ? 2 : undefined}>
                      {entry.memo}
                    </Text>
                  ) : null}
                  <Text style={styles.meta}>{`${formatTime(isoToZoned(entry.at).time)} · ${who(entry)}`}</Text>
                </View>
                {thumb ? <Image source={{ uri: thumb }} style={styles.thumb} accessibilityIgnoresInvertColors /> : null}
              </Pressable>
            );
          })}
        </View>
      ))}

      <Sheet visible={open != null} title={open?.label ?? ""} onClose={() => setOpen(null)} testID="diary-detail">
        {open ? (
          <View style={styles.detail}>
            {open.media ? (
              <Image
                source={{
                  uri:
                    open.media.resourceType === "video"
                      ? videoPosterUrl(open.media.publicId, 900)
                      : deliveryUrl(open.media.publicId, 900),
                }}
                style={styles.photo}
                resizeMode="contain"
                accessibilityIgnoresInvertColors
                testID="diary-detail-photo"
              />
            ) : null}
            {open.memo ? <Text style={styles.memo}>{open.memo}</Text> : null}
            <Text style={styles.meta}>{`${dayTitle(isoToZoned(open.at).day)} · ${formatTime(isoToZoned(open.at).time)} · ${who(open)}`}</Text>
          </View>
        ) : null}
      </Sheet>
    </>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    day: { gap: theme.spacing.xs },
    dayTitle: { fontSize: theme.fontSize.body, fontWeight: "700", color: theme.color.text },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.sm,
      padding: theme.spacing.sm,
      borderRadius: theme.radius.md,
      borderWidth: 1,
      borderColor: theme.color.border,
      backgroundColor: theme.color.surface,
    },
    missed: { borderColor: theme.color.warning },
    pressed: { opacity: 0.8 },
    emoji: { fontSize: 24 },
    body: { flex: 1, gap: 2 },
    label: { fontSize: theme.fontSize.body, fontWeight: "600", color: theme.color.text },
    memo: { fontSize: theme.fontSize.body, color: theme.color.text },
    meta: { fontSize: theme.fontSize.small, color: theme.color.textMuted },
    thumb: { width: 56, height: 56, borderRadius: theme.radius.sm, backgroundColor: theme.color.border },
    detail: { gap: theme.spacing.sm },
    photo: { width: "100%", aspectRatio: 1, borderRadius: theme.radius.md, backgroundColor: theme.color.border },
  });
