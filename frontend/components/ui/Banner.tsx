import { Pressable, StyleSheet, Text, View, ViewStyle } from "react-native";

import { useThemedStyles } from "../../providers/ThemeProvider";
import { Theme } from "../../theme/themes";

/** Same names as the Figma `Tone` variants (lower case). */
export type BannerTone = "info" | "warning" | "error" | "offline";

type Props = {
  tone?: BannerTone;
  /** One emoji at the start (Figma `Icon`). */
  icon?: string;
  title?: string;
  /** What happened and what's next, in one or two lines. */
  body: string;
  action?: { label: string; onPress: () => void; testID?: string };
  style?: ViewStyle;
  testID?: string;
};

/**
 * Figma: Goldito-Design → Components → Banner (Tone). An inline notice at the top of the content for an
 * edge state: icon + title in the tone color + one line on what happens next + optional action. Text sits
 * on the tone's own surface. Never for DANGER — that is the full-screen `AlertModal` (DESIGN.md §7.4).
 */
export function Banner({ tone = "info", icon, title, body, action, style, testID }: Props) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={[styles.base, styles[tone], style]} testID={testID}>
      {icon ? <Text style={styles.icon}>{icon}</Text> : null}
      <View style={styles.copy}>
        {title ? <Text style={[styles.title, styles[`${tone}Title`]]}>{title}</Text> : null}
        <Text style={styles.body}>{body}</Text>
        {action ? (
          <Pressable accessibilityRole="button" onPress={action.onPress} style={styles.action} testID={action.testID}>
            <Text style={[styles.actionLabel, tone === "error" && styles.errorTitle]}>{action.label}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    base: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: theme.spacing.sm,
      paddingVertical: theme.spacing.sm,
      paddingHorizontal: theme.spacing.md,
      borderRadius: theme.radius.md,
      borderWidth: 1,
    },
    info: { backgroundColor: theme.color.accent, borderColor: theme.color.border },
    warning: { backgroundColor: theme.color.warningSurface, borderColor: theme.color.warning },
    error: { backgroundColor: theme.color.errorSurface, borderColor: theme.color.error },
    offline: { backgroundColor: theme.color.surface, borderColor: theme.color.borderStrong },
    icon: { fontSize: theme.fontSize.body, lineHeight: theme.lineHeight.body },
    copy: { flex: 1, gap: 2 },
    title: { fontSize: theme.fontSize.small, lineHeight: theme.lineHeight.small, fontWeight: theme.fontWeight.semibold },
    infoTitle: { color: theme.color.primary },
    warningTitle: { color: theme.color.warning },
    errorTitle: { color: theme.color.error },
    offlineTitle: { color: theme.color.text },
    body: { fontSize: theme.fontSize.small, lineHeight: theme.lineHeight.small, color: theme.color.text },
    action: { minHeight: theme.layout.touchTarget, justifyContent: "center", alignSelf: "flex-start" },
    actionLabel: { fontSize: theme.fontSize.small, fontWeight: theme.fontWeight.semibold, color: theme.color.primary },
  });
