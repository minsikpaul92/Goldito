import { useState } from "react";
import { LayoutChangeEvent, StyleSheet, View } from "react-native";

import { useThemedStyles } from "../../providers/ThemeProvider";
import { Theme } from "../../theme/themes";

/** The width the spiral takes outside the page's left edge. */
export const SPIRAL_W = 18;
const RING_GAP = 22;
const RING_W = SPIRAL_W + 8;

/**
 * The binding of a diary: a column of coil rings down the left edge of a page or a cover (wireframe, no Figma frame
 * yet). Put it inside a box whose left margin is `SPIRAL_W`; it fills that box's height and takes no touches.
 */
export function SpiralEdge({ testID }: { testID?: string }) {
  const styles = useThemedStyles(makeStyles);
  const [height, setHeight] = useState(0);
  const count = Math.max(0, Math.floor((height - 16) / RING_GAP));
  return (
    <View
      pointerEvents="none"
      onLayout={(e: LayoutChangeEvent) => setHeight(e.nativeEvent.layout.height)}
      style={styles.edge}
      testID={testID}
    >
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={[styles.ring, { top: 12 + i * RING_GAP }]} />
      ))}
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    edge: { position: "absolute", top: 0, bottom: 0, left: -SPIRAL_W, width: SPIRAL_W, zIndex: 4 },
    ring: {
      position: "absolute",
      left: 0,
      width: RING_W,
      height: 8,
      borderRadius: 4,
      borderWidth: 2,
      borderColor: theme.color.textMuted,
      backgroundColor: theme.color.background,
    },
  });
