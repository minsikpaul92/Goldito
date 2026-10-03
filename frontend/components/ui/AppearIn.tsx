import { ReactNode, useEffect, useRef } from "react";
import { Animated, Easing, StyleProp, ViewStyle } from "react-native";

import { useTheme } from "../../providers/ThemeProvider";
import { nativeDriver, useReducedMotion } from "./motion";

type Props = {
  children: ReactNode;
  /** false renders immediately (e.g. items that were already on screen). */
  enabled?: boolean;
  /** Small overshoot for an avatar or badge that just arrived. */
  pop?: boolean;
  delay?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/** Fade and rise once on mount. For content that just arrived because of something the user did. */
export function AppearIn({ children, enabled = true, pop, delay = 0, style, testID }: Props) {
  const theme = useTheme();
  const reduced = useReducedMotion();
  const animate = enabled && !reduced;
  const progress = useRef(new Animated.Value(animate ? 0 : 1)).current;

  useEffect(() => {
    if (!animate) {
      progress.setValue(1);
      return;
    }
    Animated.timing(progress, {
      toValue: 1,
      duration: pop ? theme.motion.slow : theme.motion.base,
      delay,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: nativeDriver,
    }).start();
    // Runs once on mount by design.
  }, []);

  const transform = pop
    ? [{ scale: progress.interpolate({ inputRange: [0, 0.7, 1], outputRange: [0.85, 1.04, 1] }) }]
    : [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [theme.spacing.sm, 0] }) }];

  return (
    <Animated.View style={[style, { opacity: progress, transform }]} testID={testID}>
      {children}
    </Animated.View>
  );
}
