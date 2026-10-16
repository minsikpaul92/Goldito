import { StyleSheet, Text, View } from "react-native";

import { useThemedStyles } from "../../providers/ThemeProvider";
import { Theme } from "../../theme/themes";

/** Same tones as the Figma `Tag` component (DESIGN.md §6, D3). */
export type TagTone = "danger" | "warning" | "success" | "brand" | "neutral";

type Props = {
  label: string;
  tone?: TagTone;
  testID?: string;
};

/**
 * Read-only status label: a flat fill in every tone (never an outline), not tappable.
 * For anything the user can press or remove, use `Chip` (outlined) instead.
 */
export function Tag({ label, tone = "neutral", testID }: Props) {
  const styles = useThemedStyles(makeStyles);

  return (
    <View style={[styles.tag, styles[`tag_${tone}`]]} testID={testID}>
      <Text style={[styles.label, styles[`label_${tone}`]]}>{label}</Text>
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    tag: {
      alignSelf: "flex-start",
      paddingVertical: theme.spacing.xs,
      paddingHorizontal: theme.spacing.sm,
      borderRadius: theme.radius.sm,
    },
    tag_danger: { backgroundColor: theme.color.errorSurface },
    tag_warning: { backgroundColor: theme.color.warningSurface },
    tag_success: { backgroundColor: theme.color.successSurface },
    tag_brand: { backgroundColor: theme.color.accent },
    // `track`, not `surface`, so it stays visible on white cards; textMuted on it is 5.3:1.
    tag_neutral: { backgroundColor: theme.color.track },
    label: {
      fontSize: theme.fontSize.small,
      fontWeight: "600",
    },
    label_danger: { color: theme.color.error },
    label_warning: { color: theme.color.warning },
    label_success: { color: theme.color.success },
    label_brand: { color: theme.color.primary },
    label_neutral: { color: theme.color.textMuted },
  });
