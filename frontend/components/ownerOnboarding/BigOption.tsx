import { Pressable, StyleSheet, Text, View, ViewStyle } from "react-native";

import { Icon } from "../../components/ui/Icon";
import { useTheme, useThemedStyles } from "../../providers/ThemeProvider";
import { Theme } from "../../theme/themes";

type Props = {
  label: string;
  selected?: boolean;
  /** A small line under the label, e.g. "Suggested". */
  badge?: string;
  onPress: () => void;
  style?: ViewStyle;
  testID?: string;
};

/** A full-width answer for the large-text sign-up flow: 20 px text, 64 px high (11.15 §7.1). */
export function BigOption({ label, selected, badge, onPress, style, testID }: Props) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);

  return (
    <Pressable
      accessibilityRole="button"
      // react-native-web ignores accessibilityState.selected; aria-pressed reaches the DOM.
      aria-pressed={!!selected}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [styles.base, selected && styles.selected, pressed && styles.pressed, style]}
    >
      <View style={styles.text}>
        <Text style={styles.label}>{label}</Text>
        {badge ? <Text style={styles.badge}>{badge}</Text> : null}
      </View>
      {selected ? <Icon name="selected" size={theme.icon.md} color={theme.color.primary} /> : null}
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
    text: { flex: 1 },
    badge: { fontSize: 14, lineHeight: 18, color: theme.color.primary, fontWeight: theme.fontWeight.semibold },
    label: {
      fontSize: 20,
      lineHeight: 26,
      fontWeight: theme.fontWeight.semibold,
      color: theme.color.text,
    },
  });
