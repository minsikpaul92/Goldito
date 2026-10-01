import { Pressable, StyleSheet, Text, View } from "react-native";

import { useThemedStyles } from "../../providers/ThemeProvider";
import { Theme } from "../../theme/themes";

type Option<T extends string> = { value: T; label: string };

type Props<T extends string> = {
  options: Option<T>[];
  value: T | null;
  onChange: (value: T) => void;
  /** Read-only, e.g. pet species after creation (D22). */
  disabled?: boolean;
  testID?: string;
};

/** One-of-a-few choice as tappable segments (radio semantics). */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  disabled,
  testID,
}: Props<T>) {
  const styles = useThemedStyles(makeStyles);

  return (
    <View accessibilityRole="radiogroup" style={styles.group} testID={testID}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            aria-checked={selected}
            disabled={disabled}
            onPress={() => onChange(option.value)}
            testID={testID ? `${testID}-${option.value}` : undefined}
            style={[styles.segment, selected && styles.selected, disabled && !selected && styles.dimmed]}
          >
            <Text style={[styles.label, selected && styles.selectedLabel]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    group: {
      flexDirection: "row",
      gap: theme.spacing.sm,
    },
    segment: {
      flex: 1,
      minHeight: 44,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: theme.radius.md,
      borderWidth: 1,
      borderColor: theme.color.border,
      backgroundColor: theme.color.surface,
    },
    selected: {
      borderColor: theme.color.primary,
      backgroundColor: theme.color.accent,
    },
    dimmed: {
      opacity: 0.5,
    },
    label: {
      fontSize: theme.fontSize.body,
      color: theme.color.text,
    },
    selectedLabel: {
      fontWeight: "600",
    },
  });
