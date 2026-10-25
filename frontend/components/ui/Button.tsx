import { ReactNode } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View, ViewStyle } from "react-native";

import { useTheme, useThemedStyles } from "../../providers/ThemeProvider";
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
  /** Working (saving, sending): keeps its colour with a spinner, never the gray disabled look (audit F46). Taps are ignored. */
  loading?: boolean;
  /** Looks disabled but still takes the tap, so a screen can show what is missing (Checkout Pay, #282). */
  dimmed?: boolean;
  /** Optional icon (or logo) placed before the label. */
  icon?: ReactNode;
  style?: ViewStyle;
  testID?: string;
};

/** Figma: Goldito-Design → Components → Button (Style × State). */
export function Button({ label, onPress, disabled, variant = "primary", size = "default", loading, dimmed, icon, style, testID }: Props) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const secondary = variant === "secondary";
  const danger = variant === "danger";

  const off = disabled || dimmed;
  const labelStyle = [styles.label, size === "large" && styles.largeLabel, secondary && styles.secondaryLabel, off && styles.disabledLabel];

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        styles.base,
        size === "large" && styles.large,
        secondary && styles.secondary,
        danger && styles.danger,
        off && styles.disabled,
        pressed && !off && !loading && styles.pressed,
        style,
      ]}
    >
      {loading ? (
        <View style={styles.row}>
          <ActivityIndicator size="small" color={secondary ? theme.color.primary : theme.color.primaryText} />
          <Text style={labelStyle}>{label}</Text>
        </View>
      ) : icon ? (
        <View style={styles.row}>
          {icon}
          <Text style={labelStyle}>{label}</Text>
        </View>
      ) : (
        // The label stays the button's direct child when idle (layout and tests rely on it).
        <Text style={labelStyle}>{label}</Text>
      )}
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
    row: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: theme.spacing.sm },
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
