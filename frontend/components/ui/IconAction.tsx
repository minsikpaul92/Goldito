import { Pressable, StyleSheet, Text } from "react-native";

import { useTheme, useThemedStyles } from "../../providers/ThemeProvider";
import { Theme } from "../../theme/themes";
import { Icon, IconName } from "./Icon";

type Props = {
  icon: IconName;
  label: string;
  onPress: () => void;
  accessibilityLabel?: string;
  testID?: string;
};

/**
 * An icon with its word under it, for a short row of equal actions (Trip: Directions · Booking). Same line as a
 * secondary button; put two or three side by side with `flex: 1`.
 */
export function IconAction({ icon, label, onPress, accessibilityLabel, testID }: Props) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => [styles.tile, pressed && styles.pressed]}
      testID={testID}
    >
      <Icon name={icon} size={22} color={theme.color.primary} />
      <Text style={styles.label} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    tile: {
      flex: 1,
      minHeight: 64,
      alignItems: "center",
      justifyContent: "center",
      gap: 4,
      paddingHorizontal: theme.spacing.sm,
      borderRadius: theme.radius.lg,
      borderWidth: theme.ui.button.secondaryBorder,
      borderColor: theme.ui.button.secondaryInk ? theme.color.text : theme.color.borderStrong,
      backgroundColor: theme.color.surface,
    },
    pressed: { opacity: theme.motion.pressOpacity, transform: [{ scale: theme.motion.pressScale }] },
    label: { fontSize: theme.fontSize.small, lineHeight: theme.lineHeight.small, fontWeight: theme.fontWeight.semibold, color: theme.color.text },
  });
