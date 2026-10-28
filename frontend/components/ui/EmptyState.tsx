import { StyleSheet, Text, View } from "react-native";

import { useTheme, useThemedStyles } from "../../providers/ThemeProvider";
import { Theme } from "../../theme/themes";
import { Button } from "./Button";
import { Icon, IconName } from "./Icon";

type Props = {
  /** The picture: a line icon by meaning (camera for photos, bell for notifications…), drawn in a soft tile. */
  icon?: IconName;
  /** Older call sites: an emoji in the same tile. `icon` wins when both are set. */
  emoji?: string;
  title: string;
  /** Say what will appear here and who adds it (DESIGN.md §7.5). */
  message: string;
  action?: { label: string; onPress: () => void };
};

const TILE = 64;
const GLYPH = 28;

/** Figma: Goldito-Design → Components → Empty State. The action is a secondary button at its natural width. */
export function EmptyState({ icon, emoji, title, message, action }: Props) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);

  return (
    <View style={styles.container}>
      <View style={styles.tile} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {icon || !emoji ? (
          <Icon name={icon ?? "paw"} size={GLYPH} color={theme.color.primary} />
        ) : (
          <Text style={styles.emoji}>{emoji}</Text>
        )}
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.message}>{message}</Text>
      {action ? <Button label={action.label} onPress={action.onPress} variant="secondary" style={styles.action} /> : null}
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    container: {
      flexGrow: 1,
      alignItems: "center",
      justifyContent: "center",
      gap: theme.spacing.sm,
      paddingVertical: theme.spacing.xl,
      paddingHorizontal: theme.spacing.md,
    },
    tile: {
      width: TILE,
      height: TILE,
      borderRadius: theme.radius.xl,
      backgroundColor: theme.color.accent,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: theme.spacing.xs,
    },
    emoji: {
      fontSize: GLYPH,
    },
    title: {
      fontSize: theme.fontSize.body,
      fontWeight: theme.fontWeight.semibold,
      color: theme.color.text,
      textAlign: "center",
    },
    message: {
      fontSize: theme.fontSize.small,
      color: theme.color.textMuted,
      textAlign: "center",
    },
    action: {
      marginTop: theme.spacing.sm,
      alignSelf: "center",
    },
  });
