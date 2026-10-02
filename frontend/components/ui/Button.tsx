import { Pressable, StyleSheet, Text, ViewStyle } from "react-native";

import { useThemedStyles } from "../../providers/ThemeProvider";
import { Theme } from "../../theme/themes";

type Props = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  /** `secondary` = white + border, for a second button next to the one primary (DESIGN.md §6). */
  variant?: "primary" | "secondary";
  style?: ViewStyle;
  testID?: string;
};

export function Button({ label, onPress, disabled, variant = "primary", style, testID }: Props) {
  const styles = useThemedStyles(makeStyles);
  const secondary = variant === "secondary";

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        styles.base,
        secondary && styles.secondary,
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
        style,
      ]}
    >
      <Text style={[styles.label, secondary && styles.secondaryLabel]}>{label}</Text>
    </Pressable>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    base: {
      backgroundColor: theme.color.primary,
      paddingVertical: theme.spacing.sm + 4,
      paddingHorizontal: theme.spacing.md,
      borderRadius: theme.radius.md,
      borderWidth: 1,
      borderColor: theme.color.primary,
      alignItems: "center",
    },
    secondary: {
      backgroundColor: theme.color.surface,
      borderColor: theme.color.border,
    },
    pressed: {
      opacity: 0.9,
    },
    disabled: {
      opacity: 0.5,
    },
    label: {
      color: theme.color.primaryText,
      fontSize: theme.fontSize.body,
      fontWeight: "600",
    },
    secondaryLabel: {
      color: theme.color.primary,
    },
  });
