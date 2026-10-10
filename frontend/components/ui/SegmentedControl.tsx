import { Pressable, StyleSheet, Text, View } from "react-native";

import { useThemedStyles } from "../../providers/ThemeProvider";
import { Theme } from "../../theme/themes";

/** `count` > 0 shows a small number badge after the label (FB-30: "Requests (1)" wrapped to two lines). */
type Option<T extends string> = { value: T; label: string; count?: number };

type Props<T extends string> = {
  options: Option<T>[];
  value: T | null;
  onChange: (value: T) => void;
  /** Read-only, e.g. pet species after creation (D22). */
  disabled?: boolean;
  testID?: string;
};

/** One-of-a-few choice as tappable segments (radio semantics). Labels stay on one line. */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  disabled,
  testID,
}: Props<T>) {
  const styles = useThemedStyles(makeStyles);
  // Four segments on a phone are about 86 px each: a smaller label keeps "Questions" + a badge on one line.
  const dense = options.length >= 4;

  return (
    <View accessibilityRole="radiogroup" style={styles.group} testID={testID}>
      {options.map((option) => {
        const selected = option.value === value;
        const count = option.count ?? 0;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityLabel={count > 0 ? `${option.label}, ${count}` : option.label}
            aria-checked={selected}
            disabled={disabled}
            onPress={() => onChange(option.value)}
            testID={testID ? `${testID}-${option.value}` : undefined}
            style={[styles.segment, selected && styles.selected, disabled && !selected && styles.dimmed]}
          >
            <Text
              numberOfLines={1}
              style={[styles.label, dense && styles.denseLabel, selected && styles.selectedLabel]}
            >
              {option.label}
            </Text>
            {count > 0 ? (
              <View style={styles.badge} testID={testID ? `${testID}-${option.value}-count` : undefined}>
                <Text style={styles.badgeText}>{count > 99 ? "99+" : count}</Text>
              </View>
            ) : null}
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
      minWidth: 0,
      minHeight: 44,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: theme.spacing.xs,
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
      flexShrink: 1,
      fontSize: theme.fontSize.body,
      color: theme.color.text,
    },
    denseLabel: {
      fontSize: theme.fontSize.small,
    },
    selectedLabel: {
      fontWeight: "600",
    },
    badge: {
      // On the corner, like a notification count: it never takes the label's width.
      position: "absolute",
      top: -7,
      right: -5,
      minWidth: 18,
      height: 18,
      paddingHorizontal: 5,
      borderRadius: 9,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.color.primary,
      borderWidth: 2,
      borderColor: theme.color.background,
    },
    badgeText: {
      fontSize: theme.fontSize.caption,
      fontWeight: "700",
      color: theme.color.primaryText,
    },
  });
