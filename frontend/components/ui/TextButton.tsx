import { StyleSheet, Text, ViewStyle } from "react-native";

import { useThemedStyles } from "../../providers/ThemeProvider";
import { Theme } from "../../theme/themes";
import { PressableScale } from "./PressableScale";

type Props = {
  label: string;
  onPress: () => void;
  /** Destructive link, e.g. Cancel booking — `error` color. */
  danger?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
  testID?: string;
};

/** Secondary action as a text link — keeps one filled primary button per screen (DESIGN.md §7.1). */
export function TextButton({ label, onPress, danger, disabled, style, testID }: Props) {
  const styles = useThemedStyles(makeStyles);

  return (
    <PressableScale
      accessibilityRole="button"
      aria-disabled={!!disabled}
      disabled={disabled}
      onPress={onPress}
      testID={testID}
      style={[styles.base, disabled && styles.disabled, style]}
    >
      <Text style={[styles.label, danger && styles.danger]}>{label}</Text>
    </PressableScale>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    base: {
      minHeight: theme.layout.touchTarget,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: theme.spacing.sm,
    },
    disabled: {
      opacity: 0.4,
    },
    label: {
      fontSize: theme.fontSize.body,
      fontWeight: "600",
      color: theme.color.primary,
    },
    danger: {
      color: theme.color.error,
    },
  });
