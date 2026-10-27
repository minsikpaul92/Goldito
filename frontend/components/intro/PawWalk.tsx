import { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";
import Svg, { Ellipse, Path } from "react-native-svg";

import { useReduceMotion } from "../ui/useReduceMotion";
import { useTheme } from "../../providers/ThemeProvider";

const PRINTS = 4;
const STEP_Y = 36;
const SWAY_X = 14;
const PAW = 30;
const WIDTH = 110;
const HEIGHT = 160;

/**
 * Four paw prints walking up, left and right in turn (design site: intro-trial.html, delights.html). The same walk
 * opens the app (Boot) and closes setup (Finish); each print pops in, then settles to a faint trail. `loop` walks
 * again and again (a wait of unknown length, e.g. the judge panel resetting the stay). A looping walk is a loading
 * sign, so it keeps walking with Reduce motion on, as a fade only (no pop).
 */
export function PawWalk({ testID, loop = false }: { testID?: string; loop?: boolean }) {
  const theme = useTheme();
  const reduce = useReduceMotion();
  const pop = !reduce;
  const steps = useRef(Array.from({ length: PRINTS }, () => new Animated.Value(0))).current;

  useEffect(() => {
    if (reduce && !loop) {
      steps.forEach((s) => s.setValue(1));
      return;
    }
    const once = Animated.stagger(
      140,
      steps.map((s) => Animated.timing(s, { toValue: 1, duration: 1200, easing: Easing.bezier(0.2, 0.8, 0.2, 1), useNativeDriver: false })),
    );
    const walk = loop
      ? Animated.loop(
          Animated.sequence([
            once,
            Animated.delay(200),
            Animated.parallel(steps.map((s) => Animated.timing(s, { toValue: 0, duration: 250, useNativeDriver: false }))),
          ]),
        )
      : once;
    walk.start();
    return () => walk.stop();
  }, [reduce, steps, loop]);

  return (
    <View style={styles.walk} aria-hidden testID={testID}>
      {steps.map((s, k) => {
        const side = k % 2 ? 1 : -1;
        return (
          <Animated.View
            key={k}
            style={[
              styles.print,
              {
                left: (WIDTH - PAW) / 2 + side * SWAY_X,
                top: HEIGHT - PAW - 10 - k * STEP_Y,
                opacity: s.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0, 1, 0.4] }),
                transform: [
                  { rotate: `${side * 8}deg` },
                  { scale: pop ? s.interpolate({ inputRange: [0, 0.2, 0.4, 1], outputRange: [0.3, 1.15, 1, 1] }) : 1 },
                ],
              },
            ]}
          >
            <UprightPaw size={PAW} color={theme.color.primary} />
          </Animated.View>
        );
      })}
    </View>
  );
}

/** The intro's paw: toes up, so the walk reads as walking up (the Lucide paw is drawn on a slant). */
function UprightPaw({ size, color }: { size: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <Ellipse cx={6.2} cy={10.4} rx={1.9} ry={2.4} />
      <Ellipse cx={9.8} cy={6.6} rx={1.9} ry={2.5} />
      <Ellipse cx={14.2} cy={6.6} rx={1.9} ry={2.5} />
      <Ellipse cx={17.8} cy={10.4} rx={1.9} ry={2.4} />
      <Path d="M12 11.2c-2.6 0-5.4 3.6-5.4 5.9 0 1.6 1.2 2.4 2.6 2.4 1.2 0 1.8-.6 2.8-.6s1.6.6 2.8.6c1.4 0 2.6-.8 2.6-2.4 0-2.3-2.8-5.9-5.4-5.9z" />
    </Svg>
  );
}

const styles = StyleSheet.create({
  walk: { width: WIDTH, height: HEIGHT },
  print: { position: "absolute", width: PAW, height: PAW },
});
