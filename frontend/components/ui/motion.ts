import { useCallback, useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Platform } from "react-native";

import { useTheme } from "../../providers/ThemeProvider";

/** The native driver is unavailable on web; Animated falls back to JS there. */
export const nativeDriver = Platform.OS !== "web";

// Read once at startup so the first render already knows (no animate-then-stop flash).
let reducedNow = false;
void AccessibilityInfo.isReduceMotionEnabled()
  .then((value) => {
    reducedNow = value;
  })
  .catch(() => {});
AccessibilityInfo.addEventListener("reduceMotionChanged", (value) => {
  reducedNow = value;
});

/** OS "Reduce motion" (web: `prefers-reduced-motion`). Decorative motion must stop when true. */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(reducedNow);
  useEffect(() => {
    setReduced(reducedNow);
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduced);
    return () => sub.remove();
  }, []);
  return reduced;
}

/**
 * One short horizontal shake for a field that failed validation. Shakes when `trigger`
 * changes while `active` is true (pass a submit-attempt counter as the trigger).
 */
export function useShake(trigger: number | undefined, active: boolean) {
  const theme = useTheme();
  const reduced = useReducedMotion();
  const x = useRef(new Animated.Value(0)).current;
  const last = useRef(trigger);

  const run = useCallback(() => {
    const step = theme.motion.fast / 2;
    const d = theme.spacing.sm;
    x.setValue(0);
    Animated.sequence(
      [d, -d, d / 2, -d / 2, 0].map((toValue) =>
        Animated.timing(x, { toValue, duration: step, useNativeDriver: nativeDriver }),
      ),
    ).start();
  }, [theme, x]);

  useEffect(() => {
    if (trigger === last.current) return;
    last.current = trigger;
    if (active && !reduced) run();
  }, [trigger, active, reduced, run]);

  return { transform: [{ translateX: x }] };
}
