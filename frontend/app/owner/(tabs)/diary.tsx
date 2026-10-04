import { useCallback, useEffect, useMemo, useState } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";

import { EmptyState } from "../../../components/ui/EmptyState";
import { LoadingView } from "../../../components/ui/LoadingView";
import { Screen } from "../../../components/ui/Screen";
import { SegmentedControl } from "../../../components/ui/SegmentedControl";
import { Sheet } from "../../../components/ui/Sheet";
import { DIARY_DAYS, DiaryEntry, listDiary } from "../../../features/diary/diaryApi";
import { useMyPets } from "../../../features/pets/useMyPets";
import { addDays, appToday, formatDay, formatTime, isoToZoned } from "../../../features/schedule/dates";
import { deliveryUrl, thumbUrl, videoPosterUrl } from "../../../lib/cloudinary";
import { useNotifications } from "../../../providers/NotificationsProvider";
import { useThemedStyles } from "../../../providers/ThemeProvider";
import { Theme } from "../../../theme/themes";

type State =
  | { status: "loading" }
  | { status: "ready"; entries: DiaryEntry[] }
  | { status: "error"; message: string };

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
 * Owner Diary (phase-06 6.11, D47): what the sitter did, newest first — finished tasks (and
 * missed ones, ⚠️), 5-second check-ins with their memo, shared photos — for today and the last
 * 7 days. It refreshes by itself when a notice arrives (Realtime). Read-only; a photo is shown
 * once even when it is also in Feed.
 */
export default function OwnerDiary() {
  const styles = useThemedStyles(makeStyles);
  const { diaryRevision } = useNotifications();
  const { status: petsStatus, pets, error: petsError, reload: reloadPets } = useMyPets();
  const [petId, setPetId] = useState<string | null>(null);
  const [state, setState] = useState<State>({ status: "loading" });
  const [open, setOpen] = useState<DiaryEntry | null>(null);

  useEffect(() => {
    if (pets.length === 0) {
      setPetId(null);
      return;
    }
    setPetId((current) => (current && pets.some((p) => p.id === current) ? current : pets[0].id));
  }, [pets]);

  const load = useCallback(
    async (soft = false) => {
      if (!petId) return;
      if (!soft) setState({ status: "loading" });
      try {
        setState({ status: "ready", entries: await listDiary(petId) });
      } catch (error) {
        setState((prev) =>
          soft && prev.status === "ready" ? prev : { status: "error", message: (error as Error).message },
        );
      }
    },
    [petId],
  );

  useEffect(() => {
    void load();
  }, [load]);

  // A task / check-in / photo notice arrived — refresh quietly (no spinner).
  useEffect(() => {
    if (diaryRevision > 0) void load(true);
  }, [diaryRevision, load]);

  const days = useMemo(() => {
    if (state.status !== "ready") return [];
    const groups = new Map<string, DiaryEntry[]>();
    for (const entry of state.entries) {
      const day = isoToZoned(entry.at).day;
      groups.set(day, [...(groups.get(day) ?? []), entry]);
    }
    return [...groups.entries()];
  }, [state]);

  if (petsStatus === "loading" && pets.length === 0) return <LoadingView />;
  if (petsStatus === "error" && pets.length === 0) {
    return (
      <Screen>
        <EmptyState
          emoji="📔"
          title="Couldn't load your pets"
          message={petsError ?? "Try again."}
          action={{ label: "Try again", onPress: () => void reloadPets() }}
        />
      </Screen>
    );
  }
  if (pets.length === 0) {
    return (
      <Screen>
        <EmptyState emoji="🐾" title="No pets yet" message="Add a pet on Home — then your sitter's updates show up here." />
      </Screen>
    );
  }

  const petOptions = pets.slice(0, 4).map((p) => ({ value: p.id, label: p.name }));

  return (
    <Screen contentStyle={styles.content}>
      {petOptions.length > 1 ? (
        <SegmentedControl options={petOptions} value={petId} onChange={setPetId} testID="diary-pet" />
      ) : null}

      {state.status === "loading" ? <LoadingView /> : null}
      {state.status === "error" ? (
        <EmptyState
          emoji="📔"
          title="Couldn't load the diary"
          message={state.message}
          action={{ label: "Try again", onPress: () => void load() }}
        />
      ) : null}
      {state.status === "ready" && state.entries.length === 0 ? (
        <EmptyState
          emoji="📔"
          title="No diary yet"
          message={`When a stay is on, updates show up here live. Showing today and the last ${DIARY_DAYS} days.`}
        />
      ) : null}

      {days.map(([day, entries]) => (
        <View key={day} style={styles.day} testID={`diary-day-${day}`}>
          <Text accessibilityRole="header" style={styles.dayTitle}>
            {dayTitle(day)}
          </Text>
          {entries.map((entry) => {
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
                  {entry.memo ? <Text style={styles.memo}>{entry.memo}</Text> : null}
                  <Text style={styles.meta}>{`${formatTime(isoToZoned(entry.at).time)} · ${entry.by}`}</Text>
                </View>
                {thumb ? (
                  <Image source={{ uri: thumb }} style={styles.thumb} accessibilityIgnoresInvertColors />
                ) : null}
              </Pressable>
            );
          })}
        </View>
      ))}

      <Sheet
        visible={open != null}
        title={open?.label ?? ""}
        onClose={() => setOpen(null)}
        testID="diary-detail"
      >
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
            <Text style={styles.meta}>{`${dayTitle(isoToZoned(open.at).day)} · ${formatTime(isoToZoned(open.at).time)} · ${open.by}`}</Text>
          </View>
        ) : null}
      </Sheet>
    </Screen>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    content: { gap: theme.spacing.md },
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
