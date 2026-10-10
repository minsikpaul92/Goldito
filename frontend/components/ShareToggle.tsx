import { Pressable, StyleSheet, Text } from "react-native";

import { useThemedStyles } from "../providers/ThemeProvider";
import { Theme } from "../theme/themes";

type Props = {
  /** What turning it on does, e.g. "Share with Robert" / "Visible to sitter". */
  label: string;
  on: boolean;
  onToggle: () => void;
  disabled?: boolean;
  testID?: string;
};

/** One-tap visibility chip next to the + Photo button (no typing, D38). */
export function ShareToggle({ label, on, onToggle, disabled, testID }: Props) {
  const styles = useThemedStyles(makeStyles);
  return (
    <Pressable
      accessibilityRole="checkbox"
      // react-native-web ignores accessibilityState.checked; aria-checked reaches the DOM.
      aria-checked={on}
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onToggle}
      style={({ pressed }) => [styles.chip, on && styles.chipOn, pressed && styles.pressed]}
      testID={testID}
    >
      <Text style={[styles.label, on && styles.labelOn]}>
        {on ? "✓ " : "🔒 "}
        {on ? label : "Only you"}
      </Text>
    </Pressable>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    chip: {
      minHeight: 40,
      paddingHorizontal: theme.spacing.md,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: theme.color.border,
      backgroundColor: theme.color.surface,
      alignItems: "center",
      justifyContent: "center",
    },
    chipOn: {
      borderColor: theme.color.primary,
      backgroundColor: theme.color.accent,
    },
    pressed: { opacity: 0.85 },
    label: {
      fontSize: theme.fontSize.small,
      fontWeight: "600",
      color: theme.color.textMuted,
    },
    labelOn: { color: theme.color.text },
  });
