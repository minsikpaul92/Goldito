import { memo, useMemo } from "react";
import { StyleSheet, View } from "react-native";

type Props = {
  /** Rows of CSS colors, `null` = transparent. */
  pixels: (string | null)[][];
  /** Screen px of one pixel. */
  pixel: number;
  testID?: string;
};

type Run = { color: string | null; length: number };

/** Merge neighbours of the same color: [a, a, b] -> [{a, 2}, {b, 1}]. */
function runs(pixels: (string | null)[][]): Run[][] {
  return pixels.map((row) => {
    const out: Run[] = [];
    for (const color of row) {
      const last = out[out.length - 1];
      if (last && last.color === color) last.length += 1;
      else out.push({ color, length: 1 });
    }
    return out;
  });
}

/** A pixel picture: pixels of one color in a row are one View, so a pet is a couple of hundred Views, not 1024. */
export const PixelGrid = memo(function PixelGrid({ pixels, pixel, testID }: Props) {
  const rows = useMemo(() => runs(pixels), [pixels]);
  return (
    <View testID={testID}>
      {rows.map((row, y) => (
        <View key={y} style={styles.row}>
          {row.map((run, i) => (
            <View key={i} style={{ width: run.length * pixel, height: pixel, backgroundColor: run.color ?? "transparent" }} />
          ))}
        </View>
      ))}
    </View>
  );
});

const styles = StyleSheet.create({
  row: { flexDirection: "row" },
});
