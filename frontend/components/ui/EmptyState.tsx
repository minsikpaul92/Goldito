import { StyleSheet, Text, View } from "react-native";

import { useThemedStyles } from "../../providers/ThemeProvider";
import { Theme } from "../../theme/themes";
import { AppearIn } from "./AppearIn";
import { Button } from "./Button";

type Props = {
  emoji: string;
  title: string;
  /** Say what will appear here and who adds it (DESIGN.md §7.5). */
  message: string;
  action?: { label: string; onPress: () => void };
};

export function EmptyState({ emoji, title, message, action }: Props) {
  const styles = useThemedStyles(makeStyles);

  return (
    <View style={styles.container}>
      <AppearIn pop>
        <Text style={styles.emoji} accessibilityElementsHidden importantForAccessibility="no">
          {emoji}
        </Text>
      </AppearIn>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.message}>{message}</Text>
      {action ? <Button label={action.label} onPress={action.onPress} style={styles.action} /> : null}
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
      paddingHorizontal: theme.spacing.lg,
    },
    emoji: {
      fontSize: theme.icon.hero,
    },
    title: {
      fontSize: theme.fontSize.body,
      fontWeight: "600",
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
      alignSelf: "stretch",
    },
  });
