import { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing, LayoutChangeEvent, PanResponder, Platform, Pressable, StyleSheet, Text, View } from "react-native";

import { SegmentedControl } from "../../components/ui/SegmentedControl";
import { useSession } from "../../providers/SessionProvider";
import { useThemedStyles } from "../../providers/ThemeProvider";
import { Theme } from "../../theme/themes";
import { DecoratedReport } from "../snap/DecoratedReport";
import { formatDay } from "../schedule/dates";
import type { SentReport } from "./reportApi";

const ALL = "all";
/** Past this share of the page width a drag turns the page; a quick flick turns it too. */
const TURN_AT = 0.3;
const FLICK = 0.5; // px per ms
const TURN_MS = 380;

type Turn = "next" | "prev";

export type DiaryBookProps = {
  pages: SentReport[];
  /** Open on this page (a notice, a Feed card); otherwise on the newest. */
  initialId?: string | null;
  /** Under each page: who wrote it, or the day's tasks (owner). */
  footer?: (page: SentReport) => React.ReactNode;
  testID?: string;
};

/** Oldest first, several pages a day in send order. */
export function bookOrder(pages: SentReport[]): SentReport[] {
  return [...pages].sort((a, b) => a.day.localeCompare(b.day) || (a.sentAt ?? "").localeCompare(b.sentAt ?? ""));
}

/**
 * The diary as a book (Diary book DB.3): every sent page, oldest → newest, opening on the newest. "All" or one pet.
 * Swipe sideways (or drag with the mouse) and the page turns like paper — pivoting on the spine at the left edge — to
 * the next or the previous day; ‹ › do the same (DESIGN.md §7.7: never gesture-only). While a page is being
 * decorated the book holds still, so dragging a sticker never turns the page.
 */
export function DiaryBook({ pages, initialId, footer, testID = "diary-book" }: DiaryBookProps) {
  const styles = useThemedStyles(makeStyles);
  const session = useSession();
  const me = session.status === "signedIn" ? session.profile.id : null;
  const ordered = useMemo(() => bookOrder(pages), [pages]);
  const pets = useMemo(() => {
    const seen = new Map<string, string>();
    for (const p of ordered) if (!seen.has(p.petId)) seen.set(p.petId, p.petName);
    return [...seen].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label));
  }, [ordered]);

  const [pet, setPet] = useState<string>(ALL);
  const shown = useMemo(() => (pet === ALL ? ordered : ordered.filter((p) => p.petId === pet)), [ordered, pet]);
  const [index, setIndex] = useState(() => {
    const at = initialId ? ordered.findIndex((p) => p.id === initialId) : -1;
    return at >= 0 ? at : ordered.length - 1;
  });
  const [turning, setTurning] = useState<Turn | null>(null);
  const [decorating, setDecorating] = useState(false);
  const progress = useRef(new Animated.Value(0)).current;
  const width = useRef(1);

  // A new filter opens on its newest page; pages arriving later keep the reader where they are if possible.
  const pick = (value: string) => {
    setPet(value);
    const next = value === ALL ? ordered : ordered.filter((p) => p.petId === value);
    setIndex(next.length - 1);
  };
  useEffect(() => {
    setIndex((i) => Math.min(Math.max(0, i), Math.max(0, shown.length - 1)));
  }, [shown.length]);

  const current = shown[index] ?? null;
  const hasNext = index < shown.length - 1;
  const hasPrev = index > 0;

  const finish = (turn: Turn, commit: boolean) => {
    Animated.timing(progress, {
      toValue: commit ? 1 : 0,
      duration: commit ? TURN_MS : TURN_MS / 2,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start(() => {
      if (commit) setIndex((i) => i + (turn === "next" ? 1 : -1));
      progress.setValue(0);
      setTurning(null);
    });
  };

  const turn = (to: Turn) => {
    if (turning || decorating || (to === "next" ? !hasNext : !hasPrev)) return;
    setTurning(to);
    progress.setValue(0);
    finish(to, true);
  };

  // The latest values for the responder (it is created once).
  const live = useRef({ hasNext, hasPrev, turning, decorating });
  live.current = { hasNext, hasPrev, turning, decorating };
  const dragging = useRef<Turn | null>(null);

  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_e, g) => {
          const s = live.current;
          if (s.turning || s.decorating || Math.abs(g.dx) < 12 || Math.abs(g.dx) < Math.abs(g.dy) * 1.5) return false;
          const dir: Turn = g.dx < 0 ? "next" : "prev";
          if (dir === "next" ? !s.hasNext : !s.hasPrev) return false;
          // The way is decided here: on the web the grant's gesture state starts again from dx = 0.
          dragging.current = dir;
          return true;
        },
        // Once the page is lifting, keep the gesture: the screen's ScrollView must not take it over mid-turn.
        onPanResponderTerminationRequest: () => false,
        onShouldBlockNativeResponder: () => true,
        onPanResponderGrant: () => {
          if (!dragging.current) return;
          setTurning(dragging.current);
          progress.setValue(0);
        },
        onPanResponderMove: (_e, g) => {
          const dir = dragging.current;
          if (!dir) return;
          const share = (dir === "next" ? -g.dx : g.dx) / Math.max(1, width.current);
          progress.setValue(Math.min(1, Math.max(0, share)));
        },
        onPanResponderRelease: (_e, g) => {
          const dir = dragging.current;
          dragging.current = null;
          if (!dir) return;
          const share = (dir === "next" ? -g.dx : g.dx) / Math.max(1, width.current);
          const flick = (dir === "next" ? -g.vx : g.vx) > FLICK;
          finish(dir, share > TURN_AT || flick);
        },
        onPanResponderTerminate: () => {
          const dir = dragging.current;
          dragging.current = null;
          if (dir) finish(dir, false);
        },
      }),
    [progress],
  );

  if (!current) return null;

  const onLayout = (e: LayoutChangeEvent) => {
    width.current = e.nativeEvent.layout.width;
  };

  // The turning leaf pivots on the spine (left edge): move the origin there, rotate, move back.
  const w = width.current;
  const leaf = (angle: Animated.AnimatedInterpolation<string>) => ({
    transform: [{ perspective: 1600 }, { translateX: -w / 2 }, { rotateY: angle }, { translateX: w / 2 }],
    backfaceVisibility: "hidden" as const,
  });
  // Next: the current page lifts off to the left (0° → −180°), showing the next one under it.
  const away = progress.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "-180deg"] });
  // Previous: the previous page comes back over the current one, from edge-on (−90° → 0°) so it shows at once.
  const back = progress.interpolate({ inputRange: [0, 1], outputRange: ["-90deg", "0deg"] });
  const shade = progress.interpolate({ inputRange: [0, 1], outputRange: [0.18, 0] });

  // The page before and after stay mounted (hidden) so a turn shows them at once, photos and stickers loaded.
  // Keys are page ids: when a turn ends the next page simply becomes the current one, no reload.
  const prev = hasPrev ? shown[index - 1] : null;
  const next = hasNext ? shown[index + 1] : null;
  const role = (p: SentReport): "top" | "under" | "over" | "hidden" => {
    if (p.id === current.id) return turning === "prev" ? "under" : turning === "next" ? "over" : "top";
    if (turning === "next" && p.id === next?.id) return "under";
    if (turning === "prev" && p.id === prev?.id) return "over";
    return "hidden";
  };

  return (
    <View style={styles.wrap} testID={testID}>
      {pets.length > 1 ? (
        <SegmentedControl
          options={[{ value: ALL, label: "All" }, ...pets]}
          value={pet}
          onChange={pick}
          scrollable={pets.length > 3}
          testID={`${testID}-pet`}
        />
      ) : null}

      <View style={styles.bar}>
        <NavButton label="‹" hint="Previous page" disabled={!hasPrev || turning != null || decorating} onPress={() => turn("prev")} testID={`${testID}-prev`} />
        <View style={styles.where}>
          <Text style={styles.whereTitle} numberOfLines={1} testID={`${testID}-where`}>
            {`${current.petName} · ${formatDay(current.day)}`}
          </Text>
          <Text style={styles.whereCount}>{`Page ${index + 1} of ${shown.length}`}</Text>
        </View>
        <NavButton label="›" hint="Next page" disabled={!hasNext || turning != null || decorating} onPress={() => turn("next")} testID={`${testID}-next`} />
      </View>

      <View
        onLayout={onLayout}
        style={styles.stage}
        // Our own drag: TouchEmulation leaves the mouse to it (DESIGN.md §7.7); a finger may still scroll up and down.
        {...(Platform.OS === "web" ? ({ dataSet: { gestureOwner: "true" } } as object) : null)}
        {...pan.panHandlers}
        testID={`${testID}-stage`}
      >
        {[prev, current, next].map((p) => {
          if (!p) return null;
          const r = role(p);
          const isCurrent = p.id === current.id;
          return (
            <Animated.View
              key={p.id}
              pointerEvents={r === "top" ? "auto" : "none"}
              aria-hidden={r === "hidden" ? true : undefined}
              style={[
                // The current page sets the height; the others lie on top of it.
                isCurrent ? styles.inFlow : styles.stacked,
                r === "hidden" && styles.hidden,
                r === "under" && styles.under,
                r === "over" && [styles.over, leaf(turning === "next" ? away : back)],
              ]}
            >
              <View style={styles.page}>
                <DecoratedReport
                  reportId={p.id}
                  petId={p.petId}
                  petName={p.petName}
                  day={p.day}
                  body={p.body}
                  ownPage={me != null && p.authorId === me}
                  onEditingChange={isCurrent ? setDecorating : undefined}
                  testID={isCurrent ? testID : undefined}
                />
                {footer ? footer(p) : null}
              </View>
              {r === "under" ? <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.shade, { opacity: shade }]} /> : null}
            </Animated.View>
          );
        })}
      </View>
    </View>
  );
}

function NavButton({ label, hint, disabled, onPress, testID }: { label: string; hint: string; disabled: boolean; onPress: () => void; testID: string }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={hint}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.nav, disabled && styles.navOff, pressed && styles.pressed]}
      testID={testID}
    >
      <Text style={styles.navLabel}>{label}</Text>
    </Pressable>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    wrap: { gap: theme.spacing.sm },
    bar: { flexDirection: "row", alignItems: "center", gap: theme.spacing.sm },
    where: { flex: 1, alignItems: "center" },
    whereTitle: { fontSize: theme.fontSize.body, fontWeight: theme.fontWeight.bold, color: theme.color.text },
    whereCount: { fontSize: theme.fontSize.small, color: theme.color.textMuted },
    nav: {
      width: 44,
      height: 44,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 22,
      borderWidth: 1,
      borderColor: theme.color.border,
      backgroundColor: theme.color.surface,
    },
    navOff: { opacity: 0.35 },
    pressed: { opacity: 0.6 },
    navLabel: { fontSize: 24, lineHeight: 26, fontWeight: theme.fontWeight.bold, color: theme.color.text },
    stage: { position: "relative" },
    inFlow: { position: "relative", zIndex: 1 },
    stacked: { position: "absolute", top: 0, left: 0, right: 0 },
    // Mounted (photos and stickers load) but takes no room and shows nothing.
    hidden: { opacity: 0, zIndex: 0, height: 0, overflow: "hidden" },
    under: { zIndex: 1 },
    over: { zIndex: 2 },
    page: { gap: theme.spacing.xs, backgroundColor: theme.color.background },
    shade: { backgroundColor: theme.color.text, borderRadius: theme.radius.md },
  });
