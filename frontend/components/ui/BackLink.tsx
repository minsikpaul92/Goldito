import Ionicons from "@expo/vector-icons/Ionicons";
import { Pressable, StyleSheet, Text } from "react-native";

import { useTheme, useThemedStyles } from "../../providers/ThemeProvider";
import { Theme } from "../../theme/themes";

type Props = {
  onPress: () => void;
  testID?: string;
};

/** Chevron + “Back” — same control on signup, login, and onboarding (DESIGN.md §7). */
export function BackLink({ onPress, testID }: Props) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Back"
      onPress={onPress}
      hitSlop={theme.spacing.sm}
      style={({ pressed }) => [styles.back, pressed && styles.pressed]}
      testID={testID}
    >
      <Ionicons name="chevron-back" size={theme.icon.sm} color={theme.color.primary} />
      <Text style={styles.label}>Back</Text>
    </Pressable>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    back: {
      flexDirection: "row",
      alignItems: "center",
      alignSelf: "flex-start",
      minHeight: 44,
      gap: theme.spacing.xs,
    },
    pressed: { opacity: 0.7 },
    label: {
      fontSize: theme.fontSize.body,
      fontWeight: "600",
      color: theme.color.primary,
    },
  });
