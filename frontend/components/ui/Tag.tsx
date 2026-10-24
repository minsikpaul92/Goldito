import { StyleSheet, Text, View, ViewStyle } from "react-native";

import { Icon, IconName } from "./Icon";
import { useThemedStyles } from "../../providers/ThemeProvider";
import { Theme } from "../../theme/themes";

/** Same names as the Figma `Tone` variants (lower case). */
export type TagTone = "brand" | "success" | "warning" | "danger" | "neutral";

type Props = {
  label: string;
  tone?: TagTone;
  /** A Lucide line icon before the label, in the label's colour (status: check, clock, close, warning). */
  icon?: IconName;
  style?: ViewStyle;
  testID?: string;
};

/**
 * Figma: Goldito-Design → Components → Tag (Tone). A status label: the text sits on its tone's own
 * light surface, never a faded color (brand rule D3). Information only — a Tag is never tappable,
 * so no tone has a border (Chip = interactive, with a border; Tag = read-only, flat fill).
 * `danger` only for real problems (DANGER, failed payment); late or missed things are `warning`.
 */
export function Tag({ label, tone = "neutral", icon, style, testID }: Props) {
  const styles = useThemedStyles(makeStyles);
  const labelStyle = styles[`${tone}Label`];
  return (
    <View style={[styles.base, icon && styles.withIcon, styles[tone], style]} testID={testID}>
      {icon ? <Icon name={icon} size={14} strokeWidth={2.5} color={StyleSheet.flatten(labelStyle).color as string} /> : null}
      <Text style={[styles.label, labelStyle]}>{label}</Text>
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    base: {
      alignSelf: "flex-start",
      paddingVertical: theme.spacing.xs,
      paddingHorizontal: theme.spacing.sm,
      borderRadius: theme.ui.radius.tag,
    },
    withIcon: { flexDirection: "row", alignItems: "center", gap: theme.spacing.xs },
    label: {
      fontSize: theme.fontSize.small,
      lineHeight: theme.lineHeight.small,
      fontWeight: theme.fontWeight.semibold,
    },
    brand: { backgroundColor: theme.color.accent },
    brandLabel: { color: theme.color.primary },
    success: { backgroundColor: theme.color.successSurface },
    successLabel: { color: theme.color.success },
    warning: { backgroundColor: theme.color.warningSurface },
    warningLabel: { color: theme.color.warning },
    danger: { backgroundColor: theme.color.errorSurface },
    dangerLabel: { color: theme.color.error },
    // Flat like every tone: a border would make it read as a tappable Chip (DESIGN.md §6).
    neutral: { backgroundColor: theme.color.track },
    neutralLabel: { color: theme.color.textMuted },
  });
