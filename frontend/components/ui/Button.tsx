import { ActivityIndicator, StyleSheet, Text, View, ViewStyle } from "react-native";

import { useTheme, useThemedStyles } from "../../providers/ThemeProvider";
import { Theme } from "../../theme/themes";
import { PressableScale } from "./PressableScale";

type Props = {
  label: string;
  onPress: () => void;
  /** Can't be used yet (form incomplete). Neutral, never a faded brand color. */
  disabled?: boolean;
  /** Working on it. Keeps the brand color and label, adds a spinner, ignores presses. */
  loading?: boolean;
  /** `secondary` = white + border, for a second button next to the one primary (DESIGN.md §6). */
  variant?: "primary" | "secondary";
  style?: ViewStyle;
  testID?: string;
};

export function Button({ label, onPress, disabled, loading, variant = "primary", style, testID }: Props) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const secondary = variant === "secondary";
  const inactive = disabled || loading;
  const muted = disabled && !loading;

  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={label}
      aria-disabled={!!inactive}
      aria-busy={!!loading}
      disabled={inactive}
      onPress={onPress}
      testID={testID}
      style={[styles.base, secondary && styles.secondary, muted && styles.disabled, style]}
    >
      <View style={styles.row}>
        {loading ? (
          <ActivityIndicator size="small" color={secondary ? theme.color.primary : theme.color.primaryText} />
        ) : null}
        <Text style={[styles.label, secondary && styles.secondaryLabel, muted && styles.disabledLabel]}>{label}</Text>
      </View>
    </PressableScale>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    base: {
      minHeight: theme.layout.touchTarget,
      justifyContent: "center",
      backgroundColor: theme.color.primary,
      paddingVertical: theme.spacing.sm,
      paddingHorizontal: theme.spacing.md,
      borderRadius: theme.radius.md,
      borderWidth: 1,
      borderColor: theme.color.primary,
    },
    secondary: {
      backgroundColor: theme.color.surface,
      borderColor: theme.color.border,
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: theme.spacing.sm,
    },
    disabled: {
      backgroundColor: theme.color.border,
      borderColor: theme.color.border,
    },
    label: {
      color: theme.color.primaryText,
      fontSize: theme.fontSize.body,
      fontWeight: "600",
    },
    secondaryLabel: {
      color: theme.color.primary,
    },
    disabledLabel: {
      color: theme.color.textMuted,
    },
  });
