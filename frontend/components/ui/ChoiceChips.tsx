import { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { useThemedStyles } from "../../providers/ThemeProvider";
import { Theme } from "../../theme/themes";
import { selectable } from "./selectable";

type Option = { value: string; label: string };

type Props = {
  options: Option[];
  /** Selected values. */
  value: string[];
  /** The new selection; tapping a selected chip clears it. */
  onChange: (value: string[]) => void;
  /** Several chips can be on at once. */
  multi?: boolean;
  /** Shown after the last chip, in the same row (for example a "+" button). */
  trailing?: ReactNode;
  testID?: string;
};

/** A few tappable answers in a row that wraps. Unlike SegmentedControl, a chip can be turned off again (a skipped question). */
export function ChoiceChips({ options, value, onChange, multi, trailing, testID }: Props) {
  const styles = useThemedStyles(makeStyles);

  const toggle = (v: string) => {
    if (value.includes(v)) onChange(value.filter((x) => x !== v));
    else onChange(multi ? options.map((o) => o.value).filter((x) => x === v || value.includes(x)) : [v]);
  };

  return (
    <View style={styles.row} testID={testID}>
      {options.map((o) => {
        const on = value.includes(o.value);
        return (
          <Pressable
            key={o.value}
            accessibilityRole={multi ? "checkbox" : "radio"}
            aria-checked={on}
            accessibilityLabel={o.label}
            onPress={() => toggle(o.value)}
            testID={testID ? `${testID}-${o.value}` : undefined}
            style={[styles.chip, on && styles.on]}
          >
            <Text style={[styles.label, on && styles.onLabel]}>{o.label}</Text>
          </Pressable>
        );
      })}
      {trailing}
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    row: { flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.sm },
    chip: selectable(theme).chip,
    on: selectable(theme).chipOn,
    label: selectable(theme).label,
    onLabel: selectable(theme).labelOn,
  });
