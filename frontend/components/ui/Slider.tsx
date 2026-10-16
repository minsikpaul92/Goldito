import { useMemo, useRef, useState } from "react";
import { GestureResponderEvent, LayoutChangeEvent, PanResponder, Platform, StyleSheet, View } from "react-native";

import { useThemedStyles } from "../../providers/ThemeProvider";
import { Theme } from "../../theme/themes";

type Props = {
  value: number;
  min: number;
  max: number;
  /** Called on every step while dragging; the screen decides when to act (debounce). */
  onChange: (value: number) => void;
  /** Read by screen readers, e.g. "Search radius". */
  label: string;
  /** Spoken value, e.g. "25 km". */
  valueText?: string;
  testID?: string;
};

const THUMB = 28;
const HIT_HEIGHT = 44;

/**
 * Horizontal slider for whole numbers: tap / click the track to jump, drag the thumb (finger or mouse),
 * arrow keys ±1 and Page Up / Down ±10 on the web. It owns its drag, so the phone frame's click-drag
 * scrolling leaves it alone (DESIGN.md §7.7).
 */
export function Slider({ value, min, max, onChange, label, valueText, testID }: Props) {
  const styles = useThemedStyles(makeStyles);
  const track = useRef<View>(null);
  const box = useRef({ left: 0, width: 1 });
  const [width, setWidth] = useState(0);
  // The responder callbacks are made once; read the latest props through a ref.
  const latest = useRef({ value, min, max, onChange });
  latest.current = { value, min, max, onChange };

  const clamp = (v: number) => Math.min(latest.current.max, Math.max(latest.current.min, Math.round(v)));
  const set = (v: number) => {
    const next = clamp(v);
    if (next !== latest.current.value) latest.current.onChange(next);
  };

  const pan = useMemo(() => {
    // The page x of the track, read when a drag starts (the frame may have scrolled or scaled since layout).
    const measure = () => {
      const node = track.current as unknown as { getBoundingClientRect?: () => DOMRect } | null;
      if (Platform.OS === "web" && node?.getBoundingClientRect) {
        const rect = node.getBoundingClientRect();
        box.current = { left: rect.left, width: Math.max(1, rect.width) };
      }
    };
    const toValue = (pageX: number) => {
      const { left, width: w } = box.current;
      const usable = Math.max(1, w - THUMB);
      const ratio = (pageX - left - THUMB / 2) / usable;
      const { min: lo, max: hi } = latest.current;
      return lo + Math.min(1, Math.max(0, ratio)) * (hi - lo);
    };
    const at = (e: GestureResponderEvent) => set(toValue(e.nativeEvent.pageX));
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => {
        measure();
        at(e);
      },
      onPanResponderMove: (e) => at(e),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onLayout = (e: LayoutChangeEvent) => {
    setWidth(e.nativeEvent.layout.width);
    if (Platform.OS !== "web") {
      track.current?.measure((_x, _y, w, _h, pageX) => {
        box.current = { left: pageX, width: Math.max(1, w) };
      });
    }
  };

  const onKeyDown = (e: { key: string; preventDefault?: () => void }) => {
    const step = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1, PageUp: 10, PageDown: -10 }[e.key];
    if (step != null) {
      e.preventDefault?.();
      set(value + step);
    } else if (e.key === "Home" || e.key === "End") {
      e.preventDefault?.();
      set(e.key === "Home" ? min : max);
    }
  };

  const ratio = max > min ? (value - min) / (max - min) : 0;
  const thumbLeft = ratio * Math.max(0, width - THUMB);

  return (
    <View
      ref={track}
      onLayout={onLayout}
      style={styles.hit}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityValue={{ min, max, now: value, text: valueText }}
      accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
      onAccessibilityAction={(e) => set(value + (e.nativeEvent.actionName === "increment" ? 1 : -1))}
      {...(Platform.OS === "web"
        ? ({ dataSet: { gestureOwner: "true" }, focusable: true, onKeyDown } as object)
        : null)}
      {...pan.panHandlers}
      testID={testID}
    >
      <View style={styles.rail} pointerEvents="none">
        <View style={[styles.fill, { width: thumbLeft + THUMB / 2 }]} />
      </View>
      <View style={[styles.thumb, { left: thumbLeft }]} pointerEvents="none" testID={testID ? `${testID}-thumb` : undefined} />
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    hit: {
      height: HIT_HEIGHT,
      justifyContent: "center",
      // Web: no text selection or native touch scrolling while dragging the thumb.
      ...(Platform.OS === "web" ? ({ userSelect: "none", touchAction: "none", cursor: "pointer" } as object) : null),
    },
    rail: {
      height: 6,
      marginHorizontal: THUMB / 2,
      borderRadius: 3,
      backgroundColor: theme.color.border,
      overflow: "hidden",
    },
    fill: {
      height: 6,
      marginLeft: -THUMB / 2,
      backgroundColor: theme.color.primary,
    },
    thumb: {
      position: "absolute",
      top: (HIT_HEIGHT - THUMB) / 2,
      width: THUMB,
      height: THUMB,
      borderRadius: THUMB / 2,
      backgroundColor: theme.color.surface,
      borderWidth: 2,
      borderColor: theme.color.primary,
    },
  });
