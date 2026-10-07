import { Pressable, StyleSheet, Text, View } from "react-native";

import { useThemedStyles } from "../providers/ThemeProvider";
import { Theme } from "../theme/themes";

type Props = {
  value: number;
  /** Omit for a read-only row of stars. */
  onChange?: (value: number) => void;
  size?: number;
  testID?: string;
};

/** ★1–5 as five real buttons: a tap or a click picks, the arrow keys and Tab work like any radio group. */
export function StarRating({ value, onChange, size = 32, testID }: Props) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View accessibilityRole={onChange ? "radiogroup" : undefined} style={styles.row} testID={testID}>
      {[1, 2, 3, 4, 5].map((n) => {
        const on = n <= value;
        const star = (
          <Text style={[styles.star, { fontSize: size }, on ? styles.on : styles.off]}>{on ? "★" : "☆"}</Text>
        );
        return onChange ? (
          <Pressable
            key={n}
            accessibilityRole="radio"
            accessibilityLabel={`${n} ${n === 1 ? "star" : "stars"}`}
            aria-checked={value === n}
            onPress={() => onChange(n)}
            hitSlop={4}
            style={styles.button}
            testID={testID ? `${testID}-${n}` : undefined}
          >
            {star}
          </Pressable>
        ) : (
          <View key={n}>{star}</View>
        );
      })}
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    row: { flexDirection: "row", gap: theme.spacing.xs },
    button: { minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" },
    star: { lineHeight: undefined },
    on: { color: theme.color.warning },
    off: { color: theme.color.textMuted },
  });
