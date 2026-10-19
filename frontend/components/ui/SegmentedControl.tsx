import { Pressable, StyleSheet, Text, View } from "react-native";

import { HorizontalList } from "./HorizontalList";
import { useThemedStyles } from "../../providers/ThemeProvider";
import { Theme } from "../../theme/themes";

/** `count` > 0 shows a small number badge after the label (FB-30: "Requests (1)" wrapped to two lines). */
type Option<T extends string> = { value: T; label: string; count?: number; /** This one can't be picked. */ disabled?: boolean };

type Props<T extends string> = {
  options: Option<T>[];
  value: T | null;
  onChange: (value: T) => void;
  /** Read-only, e.g. pet species after creation (D22). */
  disabled?: boolean;
  /** Too many segments for the width: natural-width segments in a row that scrolls sideways. */
  scrollable?: boolean;
  testID?: string;
};

/** One-of-a-few choice as tappable segments (radio semantics). Labels stay on one line. */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  disabled,
  scrollable,
  testID,
}: Props<T>) {
  const styles = useThemedStyles(makeStyles);
  // Four segments on a phone are about 86 px each: a smaller label keeps "Questions" + a badge on one line.
  const dense = options.length >= 4 && !scrollable;

  const segments = (
    <>
      {options.map((option) => {
        const selected = option.value === value;
        const count = option.count ?? 0;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityLabel={count > 0 ? `${option.label}, ${count}` : option.label}
            aria-checked={selected}
            disabled={disabled || option.disabled}
            onPress={() => onChange(option.value)}
            testID={testID ? `${testID}-${option.value}` : undefined}
            style={[styles.segment, scrollable && styles.scrollSegment, selected && styles.selected, (disabled || option.disabled) && !selected && styles.dimmed]}
          >
            <Text
              numberOfLines={1}
              style={[styles.label, scrollable && styles.scrollLabel, dense && styles.denseLabel, selected && styles.selectedLabel]}
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
    </>
  );

  if (scrollable) {
    return (
      <View accessibilityRole="radiogroup" testID={testID}>
        <HorizontalList contentStyle={styles.group}>{segments}</HorizontalList>
      </View>
    );
  }
  return (
    <View accessibilityRole="radiogroup" style={styles.group} testID={testID}>
      {segments}
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
      minHeight: theme.layout.touchTarget,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: theme.spacing.xs,
      borderRadius: theme.ui.radius.segment,
      borderWidth: 1,
      borderColor: theme.color.borderStrong,
      backgroundColor: theme.color.surface,
    },
    // Natural width: never squeezed to fit, the row scrolls instead.
    scrollSegment: {
      flexGrow: 0,
      flexShrink: 0,
      flexBasis: "auto",
      minWidth: undefined,
      paddingHorizontal: theme.spacing.md,
    },
    selected: {
      borderColor: theme.color.primary,
      backgroundColor: theme.color.accent,
    },
    dimmed: {
      opacity: theme.opacity.disabled,
    },
    label: {
      flexShrink: 1,
      fontSize: theme.fontSize.body,
      color: theme.color.text,
    },
    scrollLabel: {
      flexShrink: 0,
    },
    denseLabel: {
      fontSize: theme.fontSize.small,
    },
    selectedLabel: {
      fontWeight: theme.fontWeight.semibold,
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
      fontWeight: theme.fontWeight.bold,
      color: theme.color.primaryText,
    },
  });
