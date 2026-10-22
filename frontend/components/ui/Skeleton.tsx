import { useEffect, useRef } from "react";
import { Animated, StyleSheet, View } from "react-native";

import { useThemedStyles } from "../../providers/ThemeProvider";
import { Theme } from "../../theme/themes";
import { useReduceMotion } from "./useReduceMotion";

/**
 * Loading placeholder that matches the final layout (DESIGN.md §10; audit F45): lines, a block, or a card row.
 * Pulses gently; Reduce motion keeps it still. Announced once as "Loading".
 */
export function Skeleton({ kind = "lines", testID }: { kind?: "lines" | "block" | "card"; testID?: string }) {
  const styles = useThemedStyles(makeStyles);
  const reduce = useReduceMotion();
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (reduce) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.5, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, reduce]);
  return (
    <Animated.View accessibilityRole="progressbar" accessibilityLabel="Loading" style={[styles.wrap, { opacity: pulse }]} testID={testID}>
      {kind === "block" ? <View style={styles.block} /> : null}
      {kind === "card" ? (
        <View style={styles.card}>
          <View style={styles.circle} />
          <View style={styles.lines}>
            <View style={[styles.line, { width: "70%" }]} />
            <View style={[styles.line, { width: "45%" }]} />
          </View>
        </View>
      ) : null}
      {kind === "lines" ? (
        <View style={styles.lines}>
          <View style={[styles.line, { width: "80%" }]} />
          <View style={[styles.line, { width: "55%" }]} />
        </View>
      ) : null}
    </Animated.View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    wrap: { gap: theme.spacing.sm },
    lines: { flex: 1, gap: theme.spacing.xs },
    line: { height: 12, borderRadius: 6, backgroundColor: theme.color.border },
    block: { height: 140, borderRadius: theme.radius.md, backgroundColor: theme.color.border },
    card: { flexDirection: "row", alignItems: "center", gap: theme.spacing.md, padding: theme.spacing.md, borderRadius: theme.radius.lg, backgroundColor: theme.color.surface },
    circle: { width: 48, height: 48, borderRadius: 24, backgroundColor: theme.color.border },
  });
