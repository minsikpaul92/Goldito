import { Pressable, StyleSheet, Text, ViewStyle } from "react-native";

import { useThemedStyles } from "../../providers/ThemeProvider";
import { Theme } from "../../theme/themes";

type Props = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  /** `secondary` = white + strong border, for a second button next to the one primary (DESIGN.md §6).
   * `danger` = `error` fill, white text — only for a destructive confirm that can't be undone. */
  variant?: "primary" | "secondary" | "danger";
  /** `large` = the full-width 60 px Next of one-question screens (design site: steps.html). */
  size?: "default" | "large";
  style?: ViewStyle;
  testID?: string;
};

/** Figma: Goldito-Design → Components → Button (Style × State). */
export function Button({ label, onPress, disabled, variant = "primary", size = "default", style, testID }: Props) {
  const styles = useThemedStyles(makeStyles);
  const secondary = variant === "secondary";
  const danger = variant === "danger";

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        styles.base,
        size === "large" && styles.large,
        secondary && styles.secondary,
        danger && styles.danger,
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
        style,
      ]}
    >
      <Text style={[styles.label, size === "large" && styles.largeLabel, secondary && styles.secondaryLabel, disabled && styles.disabledLabel]}>{label}</Text>
    </Pressable>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    base: {
      minHeight: theme.ui.button.height,
      justifyContent: "center",
      backgroundColor: theme.color.primary,
      paddingVertical: theme.spacing.sm,
      paddingHorizontal: theme.spacing.md,
      borderRadius: theme.ui.radius.button,
      borderWidth: 1,
      borderColor: theme.color.primary,
      alignItems: "center",
    },
    danger: {
      backgroundColor: theme.color.error,
      borderColor: theme.color.error,
    },
    large: { minHeight: 60, alignSelf: "stretch" },
    secondary: {
      backgroundColor: theme.color.surface,
      borderWidth: theme.ui.button.secondaryBorder,
      borderColor: theme.ui.button.secondaryInk ? theme.color.text : theme.color.borderStrong,
    },
    pressed: {
      opacity: theme.motion.pressOpacity,
      transform: [{ scale: theme.motion.pressScale }],
    },
    // Disabled is a flat gray button, not a faded primary, so it never reads as tappable.
    disabled: {
      backgroundColor: theme.color.border,
      borderColor: theme.color.border,
    },
    label: {
      color: theme.color.primaryText,
      fontSize: theme.fontSize.body,
      lineHeight: theme.lineHeight.body,
      fontWeight: theme.fontWeight.semibold,
    },
    largeLabel: { fontSize: theme.fontSize.lead, lineHeight: theme.lineHeight.lead, fontWeight: theme.fontWeight.bold },
    secondaryLabel: {
      color: theme.color.primary,
    },
    disabledLabel: {
      color: theme.color.textMuted,
    },
  });
