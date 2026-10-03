import { useRef } from "react";
import { Animated, Easing, Pressable, PressableProps, StyleProp, ViewStyle } from "react-native";

import { useTheme } from "../../providers/ThemeProvider";
import { nativeDriver, useReducedMotion } from "./motion";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type Props = Omit<PressableProps, "style"> & {
  style?: StyleProp<ViewStyle>;
};

/**
 * The only press feedback in the app (DESIGN: one press feel). Every tappable — buttons,
 * cards, segments, chips, tabs, header icons — is built on this; screens never set their own
 * pressed styles. Reduce motion → opacity only. Native haptics would also go here.
 */
export function PressableScale({ style, disabled, onPressIn, onPressOut, children, ...rest }: Props) {
  const theme = useTheme();
  const reduced = useReducedMotion();
  const pressed = useRef(new Animated.Value(0)).current;

  const animate = (toValue: number) =>
    Animated.timing(pressed, {
      toValue,
      duration: theme.motion.fast,
      easing: Easing.out(Easing.quad),
      useNativeDriver: nativeDriver,
    }).start();

  const feedback = {
    opacity: pressed.interpolate({ inputRange: [0, 1], outputRange: [1, theme.motion.pressOpacity] }),
    transform: reduced
      ? []
      : [{ scale: pressed.interpolate({ inputRange: [0, 1], outputRange: [1, theme.motion.pressScale] }) }],
  };

  return (
    <AnimatedPressable
      disabled={disabled}
      onPressIn={(event) => {
        if (!disabled) animate(1);
        onPressIn?.(event);
      }}
      onPressOut={(event) => {
        animate(0);
        onPressOut?.(event);
      }}
      style={[style, disabled ? null : feedback]}
      {...rest}
    >
      {children}
    </AnimatedPressable>
  );
}
