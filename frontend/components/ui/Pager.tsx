import { ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing, PanResponder, Platform, Pressable, StyleSheet, View } from "react-native";

import { useThemedStyles } from "../../providers/ThemeProvider";
import { Theme } from "../../theme/themes";

/** Dragging this far (a share of the width) or flicking this fast turns the page. */
const TURN_RATIO = 0.2;
const TURN_VELOCITY = 0.4;
/** Mouse wheel / trackpad: a sideways scroll this big turns the page, then waits so one flick turns one page. */
const WHEEL_STEP = 30;
const WHEEL_PAUSE_MS = 450;

type Props = {
  pages: { label: string; content: ReactNode }[];
  testID?: string;
};

/**
 * Swipe pages with dots (Home hero, 11.12). Touch, mouse drag and sideways wheel all turn the page; the dots are
 * buttons too. A page is built only once it is shown (or being dragged to), so Home does not load the pet room until
 * someone looks at it, and a child that swipes on its own (a row you swipe away) keeps its drag.
 */
export function Pager({ pages, testID }: Props) {
  const styles = useThemedStyles(makeStyles);
  const [width, setWidth] = useState(0);
  const [index, setIndex] = useState(0);
  const [seen, setSeen] = useState<ReadonlySet<number>>(() => new Set([0]));
  const x = useRef(new Animated.Value(0)).current;
  const indexRef = useRef(0);
  const widthRef = useRef(0);
  const lastWheel = useRef(0);
  indexRef.current = index;
  widthRef.current = width;
  const last = pages.length - 1;

  const show = (target: number) => {
    const next = Math.max(0, Math.min(last, target));
    setSeen((prev) => (prev.has(next) ? prev : new Set(prev).add(next)));
    setIndex(next);
    Animated.timing(x, {
      toValue: -next * widthRef.current,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  };
  const showRef = useRef(show);
  showRef.current = show;

  // Keep the current page in place when the width changes (rotation, the desktop frame).
  useEffect(() => {
    x.setValue(-indexRef.current * width);
  }, [width, x]);

  const pan = useMemo(
    () =>
      PanResponder.create({
        // Only a mostly horizontal drag takes over, so scrolling and taps keep working.
        onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 10 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
        onPanResponderGrant: () => {
          const neighbours = [indexRef.current - 1, indexRef.current + 1].filter((i) => i >= 0 && i <= last);
          setSeen((prev) => (neighbours.every((i) => prev.has(i)) ? prev : new Set([...prev, ...neighbours])));
        },
        onPanResponderMove: (_e, g) => {
          const base = -indexRef.current * widthRef.current;
          const lo = -last * widthRef.current;
          x.setValue(Math.max(lo, Math.min(0, base + g.dx)));
        },
        onPanResponderRelease: (_e, g) => {
          const turn = Math.abs(g.dx) > widthRef.current * TURN_RATIO || Math.abs(g.vx) > TURN_VELOCITY;
          showRef.current(indexRef.current + (turn ? (g.dx < 0 ? 1 : -1) : 0));
        },
        onPanResponderTerminate: () => showRef.current(indexRef.current),
      }),
    [x, last],
  );

  const onWheel = (e: { deltaX: number; deltaY: number; shiftKey?: boolean }) => {
    const dx = e.shiftKey && Math.abs(e.deltaX) < 1 ? e.deltaY : e.deltaX;
    const now = Date.now();
    if (Math.abs(dx) < WHEEL_STEP || now - lastWheel.current < WHEEL_PAUSE_MS) return;
    lastWheel.current = now;
    showRef.current(indexRef.current + (dx > 0 ? 1 : -1));
  };

  return (
    <View style={styles.root} testID={testID}>
      <View style={styles.dots} accessibilityRole="tablist">
        {pages.map((page, i) => (
          <Pressable
            key={page.label}
            accessibilityLabel={page.label}
            accessibilityRole="tab"
            aria-selected={i === index}
            hitSlop={12}
            onPress={() => show(i)}
            style={[styles.dot, i === index && styles.dotOn]}
            testID={testID ? `${testID}-dot-${i}` : undefined}
          />
        ))}
      </View>
      <View
        style={styles.clip}
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        {...(Platform.OS === "web" ? ({ onWheel } as object) : null)}
        {...pan.panHandlers}
      >
        <Animated.View style={[styles.track, { width: width * pages.length, transform: [{ translateX: x }] }]}>
          {pages.map((page, i) => (
            <View
              key={page.label}
              style={{ width }}
              {...(i === index ? null : ({ "aria-hidden": true, inert: true } as object))}
              testID={testID ? `${testID}-page-${i}` : undefined}
            >
              {seen.has(i) ? page.content : null}
            </View>
          ))}
        </Animated.View>
      </View>
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    root: { flex: 1 },
    dots: {
      flexDirection: "row",
      justifyContent: "center",
      gap: theme.spacing.sm,
      paddingVertical: theme.spacing.sm,
      backgroundColor: theme.color.background,
    },
    dot: { width: 8, height: 8, borderRadius: theme.radius.pill, backgroundColor: theme.color.track },
    dotOn: { backgroundColor: theme.color.primary },
    clip: { flex: 1, overflow: "hidden" },
    track: { flex: 1, flexDirection: "row" },
  });
