import { ReactNode, useMemo, useRef, useState } from "react";
import { Animated, Easing, PanResponder, Platform, Pressable, StyleSheet, View } from "react-native";

import { Icon } from "./Icon";
import { useTheme, useThemedStyles } from "../../providers/ThemeProvider";
import { Theme } from "../../theme/themes";

/** A sideways drag this far (px) or flick this fast flips the card. */
const TURN_DISTANCE = 60;
const TURN_VELOCITY = 0.4;
/** Mouse wheel / trackpad: a sideways scroll this big flips the card, then waits so one flick flips once. */
const WHEEL_STEP = 30;
const WHEEL_PAUSE_MS = 600;
const FLIP_MS = 420;

type Props = {
  /** Exactly two pages: the front and the back of the card. */
  pages: { label: string; content: ReactNode }[];
  testID?: string;
};

/**
 * A two-sided card (Home hero, #286): the flip button turns it 180 degrees to the other page. A sideways drag or wheel
 * flips it too, and the card turns the way the finger or the wheel goes (it follows the drag, a short drag springs back).
 * The back is built only once it is shown, so Home does not load the pet room until someone looks at it.
 */
export function Pager({ pages, testID }: Props) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [index, setIndex] = useState(0);
  const [seen, setSeen] = useState<ReadonlySet<number>>(() => new Set([0]));
  // The card's angle in degrees: 0 shows the front, 180 the back. It moves within -180..360 and is folded back to 0 or
  // 180 after each turn, so a turn to either side lands on the same page.
  const angle = useRef(new Animated.Value(0)).current;
  const base = useRef(0);
  const width = useRef(300);
  const indexRef = useRef(0);
  const lastWheel = useRef(0);
  indexRef.current = index;

  /** Turn the card half a turn: `dir` 1 spins it to the right, -1 to the left. */
  const turnTo = (dir: 1 | -1) => {
    const target = base.current + dir * 180;
    const next = (((target % 360) + 360) % 360) / 180; // 0 front, 1 back
    setSeen((prev) => (prev.has(next) ? prev : new Set(prev).add(next)));
    setIndex(next);
    base.current = next * 180;
    Animated.timing(angle, { toValue: target, duration: FLIP_MS, easing: Easing.inOut(Easing.cubic), useNativeDriver: false }).start(
      ({ finished }) => {
        if (finished) angle.setValue(base.current);
      },
    );
  };
  const settle = () => Animated.spring(angle, { toValue: base.current, useNativeDriver: false, bounciness: 0 }).start();
  const flip = () => turnTo(indexRef.current === 0 ? 1 : -1);
  const turnRef = useRef(turnTo);
  turnRef.current = turnTo;
  const settleRef = useRef(settle);
  settleRef.current = settle;

  const pan = useMemo(
    () =>
      PanResponder.create({
        // Only a mostly horizontal drag takes over, so scrolling and taps keep working.
        onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 10 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
        onPanResponderGrant: () => angle.stopAnimation(),
        // The face follows the finger: a drag across the card's width is half a turn.
        onPanResponderMove: (_e, g) => angle.setValue(base.current + Math.max(-1, Math.min(1, g.dx / width.current)) * 180),
        onPanResponderRelease: (_e, g) => {
          if (Math.abs(g.dx) > TURN_DISTANCE || Math.abs(g.vx) > TURN_VELOCITY) turnRef.current((g.dx || g.vx) > 0 ? 1 : -1);
          else settleRef.current();
        },
        onPanResponderTerminate: () => settleRef.current(),
      }),
    [angle],
  );

  const onWheel = (e: { deltaX: number; deltaY: number; shiftKey?: boolean }) => {
    const dx = e.shiftKey && Math.abs(e.deltaX) < 1 ? e.deltaY : e.deltaX;
    const now = Date.now();
    if (Math.abs(dx) < WHEEL_STEP || now - lastWheel.current < WHEEL_PAUSE_MS) return;
    lastWheel.current = now;
    // Scrolling sideways to the right (deltaX > 0) is a swipe to the left.
    turnRef.current(dx > 0 ? -1 : 1);
  };

  // Each face is shown on its own half of the turn (backfaceVisibility alone let the front show through on web).
  const face = (back: boolean) => ({
    opacity: angle.interpolate({
      inputRange: [-180, -90, -89.99, 89.99, 90, 270, 270.01, 360],
      outputRange: back ? [1, 1, 0, 0, 1, 1, 0, 0] : [0, 0, 1, 1, 0, 0, 1, 1],
    }),
    transform: [
      { perspective: 1200 },
      {
        rotateY: angle.interpolate({
          inputRange: [-180, 360],
          outputRange: back ? ["0deg", "540deg"] : ["-180deg", "360deg"],
        }),
      },
    ],
  });

  return (
    <View style={styles.root} testID={testID}>
      <View style={styles.bar}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Flip to ${pages[index === 0 ? 1 : 0].label}`}
          hitSlop={8}
          onPress={flip}
          style={({ pressed }) => [styles.flip, pressed && styles.pressed]}
          testID={testID ? `${testID}-flip` : undefined}
        >
          <Icon name="refresh" size={theme.icon.sm} color={theme.color.primary} />
        </Pressable>
      </View>
      <View
        style={styles.clip}
        onLayout={(e) => {
          width.current = e.nativeEvent.layout.width || 300;
        }}
        {...(Platform.OS === "web" ? ({ onWheel } as object) : null)}
        {...pan.panHandlers}
      >
        {pages.map((page, i) => (
          <Animated.View
            key={page.label}
            style={[styles.face, face(i === 1)]}
            pointerEvents={i === index ? "auto" : "none"}
            {...(i === index ? null : ({ "aria-hidden": true, inert: true } as object))}
            testID={testID ? `${testID}-page-${i}` : undefined}
          >
            {seen.has(i) ? page.content : null}
          </Animated.View>
        ))}
      </View>
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    root: { flex: 1 },
    bar: {
      flexDirection: "row",
      justifyContent: "flex-end",
      paddingHorizontal: theme.spacing.md,
      paddingVertical: theme.spacing.xs,
      backgroundColor: theme.color.background,
    },
    flip: {
      width: 32,
      height: 32,
      borderRadius: theme.radius.pill,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.color.accent,
    },
    pressed: { opacity: 0.8 },
    clip: { flex: 1 },
    face: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backfaceVisibility: "hidden" },
  });
