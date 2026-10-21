import Ionicons from "@expo/vector-icons/Ionicons";
import { Pressable, StyleSheet, Text, ViewStyle } from "react-native";

import { useTheme, useThemedStyles } from "../../providers/ThemeProvider";
import { Theme } from "../../theme/themes";

type Props = {
  label: string;
  selected?: boolean;
  onPress: () => void;
  style?: ViewStyle;
  testID?: string;
};

/** A full-width answer for the large-text sign-up flow: 20 px text, 64 px high (11.15 §7.1). */
export function BigOption({ label, selected, onPress, style, testID }: Props) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [styles.base, selected && styles.selected, pressed && styles.pressed, style]}
    >
      <Text style={styles.label}>{label}</Text>
      {selected ? <Ionicons name="checkmark-circle" size={theme.icon.md} color={theme.color.primary} /> : null}
    </Pressable>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    base: {
      minHeight: 64,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: theme.spacing.sm,
      paddingHorizontal: theme.spacing.md,
      paddingVertical: theme.spacing.sm,
      backgroundColor: theme.color.surface,
      borderRadius: theme.ui.radius.button,
      borderWidth: 2,
      borderColor: theme.color.border,
    },
    selected: {
      borderColor: theme.color.primary,
      backgroundColor: theme.color.accent,
    },
    pressed: { opacity: theme.opacity.pressed },
    label: {
      flex: 1,
      fontSize: 20,
      lineHeight: 26,
      fontWeight: theme.fontWeight.semibold,
      color: theme.color.text,
    },
  });
