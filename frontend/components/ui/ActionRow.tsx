import { Pressable, StyleSheet, Text, View } from "react-native";

import { useTheme, useThemedStyles } from "../../providers/ThemeProvider";
import { Theme } from "../../theme/themes";
import { Icon, IconName } from "./Icon";

/** DESIGN.md §6 Action Row: a 60 px row with an icon tile, a title and a line under it, and a chevron. */
export function ActionRow({ icon, title, subtitle, onPress, testID }: { icon: IconName; title: string; subtitle: string; onPress: () => void; testID?: string }) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <Pressable accessibilityRole="button" accessibilityHint={subtitle} onPress={onPress} style={({ pressed }) => [styles.row, pressed && styles.pressed]} testID={testID}>
      <View style={styles.rowIcon}>
        <Icon name={icon} size={20} color={theme.color.primary} />
      </View>
      <View style={styles.rowText}>
        <Text style={styles.rowTitle}>{title}</Text>
        <Text style={styles.rowSub}>{subtitle}</Text>
      </View>
      <Icon name="forward" size={20} color={theme.color.text} />
    </Pressable>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    row: {
      minHeight: 60,
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.md,
      paddingVertical: theme.spacing.sm,
      paddingHorizontal: theme.spacing.md,
      borderRadius: theme.radius.lg,
      borderWidth: 1,
      borderColor: theme.color.borderStrong,
      backgroundColor: theme.color.surface,
    },
    pressed: { opacity: 0.85 },
    rowIcon: { width: 40, height: 40, borderRadius: theme.radius.md, alignItems: "center", justifyContent: "center", backgroundColor: theme.color.accent },
    rowText: { flex: 1, minWidth: 0 },
    rowTitle: { fontSize: theme.fontSize.body, lineHeight: theme.lineHeight.body, fontWeight: theme.fontWeight.semibold, color: theme.color.text },
    rowSub: { fontSize: theme.fontSize.small, lineHeight: theme.lineHeight.small, color: theme.color.textMuted },
  });
