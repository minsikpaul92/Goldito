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
 * flips it too. The back is built only once it is shown, so Home does not load the pet room until someone looks at it.
 */
export function Pager({ pages, testID }: Props) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [index, setIndex] = useState(0);
  const [seen, setSeen] = useState<ReadonlySet<number>>(() => new Set([0]));
  const turn = useRef(new Animated.Value(0)).current;
  const indexRef = useRef(0);
  const lastWheel = useRef(0);
  indexRef.current = index;

  const show = (target: number) => {
    const next = Math.max(0, Math.min(pages.length - 1, target));
    if (next === indexRef.current) return;
    setSeen((prev) => (prev.has(next) ? prev : new Set(prev).add(next)));
    setIndex(next);
    Animated.timing(turn, { toValue: next, duration: FLIP_MS, easing: Easing.inOut(Easing.cubic), useNativeDriver: false }).start();
  };
  const flip = () => show(indexRef.current === 0 ? 1 : 0);
  const flipRef = useRef(flip);
  flipRef.current = flip;

  const pan = useMemo(
    () =>
      PanResponder.create({
        // Only a mostly horizontal drag takes over, so scrolling and taps keep working.
        onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 10 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
        onPanResponderRelease: (_e, g) => {
          if (Math.abs(g.dx) > TURN_DISTANCE || Math.abs(g.vx) > TURN_VELOCITY) flipRef.current();
        },
      }),
    [],
  );

  const onWheel = (e: { deltaX: number; deltaY: number; shiftKey?: boolean }) => {
    const dx = e.shiftKey && Math.abs(e.deltaX) < 1 ? e.deltaY : e.deltaX;
    const now = Date.now();
    if (Math.abs(dx) < WHEEL_STEP || now - lastWheel.current < WHEEL_PAUSE_MS) return;
    lastWheel.current = now;
    flipRef.current();
  };

  // Each face is shown on its own half of the turn (backfaceVisibility alone let the front show through on web).
  const face = (back: boolean) => ({
    opacity: turn.interpolate({ inputRange: [0, 0.49, 0.51, 1], outputRange: back ? [0, 0, 1, 1] : [1, 1, 0, 0] }),
    transform: [
      { perspective: 1200 },
      { rotateY: turn.interpolate({ inputRange: [0, 1], outputRange: back ? ["180deg", "360deg"] : ["0deg", "180deg"] }) },
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
