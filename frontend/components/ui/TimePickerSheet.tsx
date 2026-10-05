import { useCallback, useEffect, useRef, useState } from "react";
import { NativeScrollEvent, NativeSyntheticEvent, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { formatTime } from "../../features/schedule/dates";
import { useThemedStyles } from "../../providers/ThemeProvider";
import { Theme } from "../../theme/themes";
import { Button } from "./Button";
import { Sheet } from "./Sheet";

type Props = {
  visible: boolean;
  /** "HH:MM", 24 h. */
  value: string;
  title?: string;
  onClose: () => void;
  onPick: (time: string) => void;
  testID?: string;
};

const ITEM = 44;
const VISIBLE = 5; // rows in view; the middle one is the selection
const PAD = ((VISIBLE - 1) / 2) * ITEM;
/** After a tap the wheel scrolls itself; ignore "scroll stopped" guesses until it has arrived. */
const TAP_SCROLL_LOCK_MS = 700;
const pad = (n: number) => String(n).padStart(2, "0");

const HOURS = Array.from({ length: 12 }, (_, i) => ({ value: i + 1, label: String(i + 1), id: `time-hour-${i + 1}` }));
const MINUTES = Array.from({ length: 60 }, (_, i) => ({ value: i, label: pad(i), id: `time-min-${pad(i)}` }));
const MERIDIEM = [
  { value: 0, label: "AM", id: "time-ampm-am" },
  { value: 1, label: "PM", id: "time-ampm-pm" },
];

function split(value: string) {
  const [h, m] = value.split(":").map(Number);
  return { hour12: h % 12 === 0 ? 12 : h % 12, minute: m, pm: h >= 12 };
}

function join(hour12: number, minute: number, pm: boolean) {
  return `${pad((hour12 % 12) + (pm ? 12 : 0))}:${pad(minute)}`;
}

// Web only: the browser's own scroll-snap keeps the drum smooth with a trackpad, wheel or drag.
const webSnap = (Platform.OS === "web" ? { scrollSnapType: "y mandatory", overscrollBehavior: "contain" } : null) as object;
const webSnapItem = (Platform.OS === "web" ? { scrollSnapAlign: "center" } : null) as object;

type WheelItem = { value: number; label: string; id: string };

/**
 * One drum of the picker: scroll (finger, mouse drag or mouse wheel) and it settles on a row,
 * or just tap a row. The row in the highlighted band is the choice.
 */
function Wheel({ items, selected, onSelect, flex = 1 }: { items: WheelItem[]; selected: number; onSelect: (v: number) => void; flex?: number }) {
  const styles = useThemedStyles(makeStyles);
  const ref = useRef<ScrollView>(null);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lockedUntil = useRef(0);
  const index = Math.max(0, items.findIndex((i) => i.value === selected));
  const indexRef = useRef(index);
  indexRef.current = index;

  const scrollTo = useCallback((i: number, animated: boolean) => ref.current?.scrollTo({ y: i * ITEM, animated }), []);

  // Start on the current value (a frame later: the rows must be laid out first on the web).
  const placed = useRef(false);
  const place = () => {
    if (placed.current) return;
    placed.current = true;
    requestAnimationFrame(() => requestAnimationFrame(() => scrollTo(indexRef.current, false)));
  };

  useEffect(
    () => () => {
      if (settleTimer.current) clearTimeout(settleTimer.current);
    },
    [],
  );

  const settle = (y: number) => {
    // A slow machine can pause a tap-initiated scroll halfway; snapping then would pick the wrong row.
    if (Date.now() < lockedUntil.current) return;
    const i = Math.max(0, Math.min(items.length - 1, Math.round(y / ITEM)));
    if (i !== indexRef.current) onSelect(items[i].value);
    // On the web the browser's own scroll-snap has already landed on a row; nudging it again is what jerks.
    if (Platform.OS !== "web" || Math.abs(y - i * ITEM) > 1) scrollTo(i, true);
  };

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y;
    if (settleTimer.current) clearTimeout(settleTimer.current);
    // The scroll has stopped when no event arrives for a moment; then snap to the nearest row.
    settleTimer.current = setTimeout(() => settle(y), Platform.OS === "web" ? 140 : 60);
  };

  return (
    <ScrollView
      ref={ref}
      style={[styles.wheel, { flex }, webSnap]}
      contentContainerStyle={{ paddingVertical: PAD }}
      showsVerticalScrollIndicator={false}
      snapToInterval={ITEM}
      decelerationRate="fast"
      scrollEventThrottle={16}
      onScroll={onScroll}
      onLayout={place}
    >
      {items.map((item, i) => {
        const distance = Math.abs(i - index);
        return (
          <Pressable
            key={item.id}
            accessibilityRole="radio"
            // react-native-web ignores accessibilityState.checked; aria-checked reaches the DOM.
            aria-checked={i === index}
            onPress={() => {
              lockedUntil.current = Date.now() + TAP_SCROLL_LOCK_MS;
              onSelect(item.value);
              scrollTo(i, true);
            }}
            style={[styles.item, webSnapItem]}
            testID={item.id}
          >
            <Text style={[styles.itemText, i === index ? styles.itemOn : { opacity: distance === 1 ? 0.55 : 0.3 }]}>{item.label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/**
 * Time picker like the iPhone's: three drums — hour, minute, AM/PM — with a highlighted band in
 * the middle. Works with a finger, a mouse drag, the mouse wheel, or taps (DESIGN.md §7.7).
 */
export function TimePickerSheet({ visible, value, title = "Pick a time", onClose, onPick, testID = "time-picker" }: Props) {
  const styles = useThemedStyles(makeStyles);
  const [draft, setDraft] = useState(split(value));

  useEffect(() => {
    if (visible) setDraft(split(value));
  }, [visible, value]);

  return (
    <Sheet
      visible={visible}
      title={title}
      onClose={onClose}
      testID={testID}
      footer={
        <Button
          label={`Set ${formatTime(join(draft.hour12, draft.minute, draft.pm))}`}
          onPress={() => onPick(join(draft.hour12, draft.minute, draft.pm))}
          testID={`${testID}-set`}
        />
      }
    >
      <View style={styles.frame}>
        <View style={styles.band} pointerEvents="none" />
        <View style={styles.wheels}>
          <Wheel items={HOURS} selected={draft.hour12} onSelect={(hour12) => setDraft((d) => ({ ...d, hour12 }))} />
          <Text style={styles.colon}>:</Text>
          <Wheel items={MINUTES} selected={draft.minute} onSelect={(minute) => setDraft((d) => ({ ...d, minute }))} />
          <Wheel items={MERIDIEM} selected={draft.pm ? 1 : 0} onSelect={(v) => setDraft((d) => ({ ...d, pm: v === 1 }))} />
        </View>
      </View>
    </Sheet>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    frame: { height: ITEM * VISIBLE, justifyContent: "center" },
    band: {
      position: "absolute",
      left: 0,
      right: 0,
      top: PAD,
      height: ITEM,
      borderRadius: theme.radius.md,
      backgroundColor: theme.color.accent,
    },
    wheels: { flexDirection: "row", alignItems: "center", height: ITEM * VISIBLE },
    wheel: { height: ITEM * VISIBLE },
    colon: { fontSize: theme.fontSize.title, fontWeight: "700", color: theme.color.text },
    item: { height: ITEM, alignItems: "center", justifyContent: "center" },
    itemText: { fontSize: theme.fontSize.title, color: theme.color.text },
    itemOn: { fontWeight: "700" },
  });
