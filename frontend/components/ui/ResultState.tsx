import { StyleSheet, Text, View } from "react-native";

import { Icon } from "./Icon";
import { useTheme, useThemedStyles } from "../../providers/ThemeProvider";
import { Theme } from "../../theme/themes";
import { Button } from "./Button";
import { sectionTitleStyle } from "./SectionTitle";

type Props = {
  title: string;
  message: string;
  /** The next step, as the one primary button. */
  action?: { label: string; onPress: () => void };
  testID?: string;
};

/** The end of a flow (design site: steps.html "Request sent"): a check, one line on what happens next, one next step. */
export function ResultState({ title, message, action, testID }: Props) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.wrap} testID={testID} accessibilityLiveRegion="polite">
      <View style={styles.check}>
        <Icon name="check" size={36} color={theme.color.primary} />
      </View>
      <Text accessibilityRole="header" style={styles.title}>
        {title}
      </Text>
      <Text style={styles.message}>{message}</Text>
      {action ? <Button label={action.label} onPress={action.onPress} size="large" style={styles.action} /> : null}
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    wrap: { flexGrow: 1, alignItems: "center", justifyContent: "center", gap: theme.spacing.sm, padding: theme.spacing.lg },
    check: { width: 72, height: 72, borderRadius: 36, backgroundColor: theme.color.accent, alignItems: "center", justifyContent: "center", marginBottom: theme.spacing.sm },
    title: { ...sectionTitleStyle(theme), textAlign: "center" },
    message: { fontSize: theme.fontSize.body, lineHeight: theme.lineHeight.body, color: theme.color.textMuted, textAlign: "center", maxWidth: 300 },
    action: { marginTop: theme.spacing.md },
  });
