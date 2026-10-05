import { ReactNode, useMemo, useRef, useState } from "react";
import { Animated, PanResponder, StyleSheet, Text, View } from "react-native";

import { useThemedStyles } from "../../providers/ThemeProvider";
import { Theme } from "../../theme/themes";

/** Swiping this far (a share of the row's width) deletes; less springs back — like iPhone notifications. */
export const SWIPE_DELETE_RATIO = 0.6;

type Props = {
  children: ReactNode;
  onDelete: () => void;
  /** Corner radius of the row, so the red layer under it is cut to the same shape. */
  radius?: number;
  testID?: string;
};

/**
 * Swipe a row to the left to delete it. Past 60% of the width on release it slides away and
 * `onDelete` runs; otherwise it springs back. A tap still goes through to the row's own press.
 * Screen readers get a "Delete" action instead of the gesture.
 */
export function SwipeToDelete({ children, onDelete, radius = 0, testID }: Props) {
  const styles = useThemedStyles(makeStyles);
  const x = useRef(new Animated.Value(0)).current;
  const [width, setWidth] = useState(0);
  const widthRef = useRef(0);
  widthRef.current = width;
  const deleteRef = useRef(onDelete);
  deleteRef.current = onDelete;

  const pan = useMemo(
    () =>
      PanResponder.create({
        // Only a mostly horizontal drag takes over, so scrolling and taps keep working.
        onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 10 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
        onPanResponderMove: (_e, g) => x.setValue(Math.min(0, g.dx)),
        onPanResponderRelease: (_e, g) => {
          const w = widthRef.current;
          if (w > 0 && -g.dx >= w * SWIPE_DELETE_RATIO) {
            Animated.timing(x, { toValue: -w, duration: 160, useNativeDriver: false }).start(() =>
              deleteRef.current(),
            );
          } else {
            Animated.spring(x, { toValue: 0, useNativeDriver: false, bounciness: 6 }).start();
          }
        },
        onPanResponderTerminate: () => Animated.spring(x, { toValue: 0, useNativeDriver: false }).start(),
      }),
    [x],
  );

  return (
    <View
      style={{ overflow: "hidden", borderRadius: radius }}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      accessibilityActions={[{ name: "delete", label: "Delete" }]}
      onAccessibilityAction={(e) => {
        if (e.nativeEvent.actionName === "delete") deleteRef.current();
      }}
      testID={testID}
    >
      {/* Only visible while the row is pulled aside, so it never peeks out at the rounded corners. */}
      <Animated.View
        style={[
          styles.behind,
          { borderRadius: radius, opacity: x.interpolate({ inputRange: [-24, 0], outputRange: [1, 0], extrapolate: "clamp" }) },
        ]}
        pointerEvents="none"
        testID={testID ? `${testID}-behind` : undefined}
      >
        <Text style={styles.behindText}>🗑️ Delete</Text>
      </Animated.View>
      <Animated.View style={{ transform: [{ translateX: x }] }} {...pan.panHandlers}>
        {children}
      </Animated.View>
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    behind: {
      ...StyleSheet.absoluteFill,
      alignItems: "flex-end",
      justifyContent: "center",
      paddingRight: theme.spacing.lg,
      backgroundColor: theme.color.error,
    },
    behindText: { color: theme.color.primaryText, fontSize: theme.fontSize.body, fontWeight: "700" },
  });
