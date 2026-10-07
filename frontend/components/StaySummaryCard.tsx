import { StyleSheet, Text, View } from "react-native";

import type { StaySummary } from "../features/completion/completionApi";
import { useThemedStyles } from "../providers/ThemeProvider";
import { Theme } from "../theme/themes";
import { Card } from "./ui/Card";

type Props = {
  summary: StaySummary;
  /** "Oct 9 – Oct 12" */
  period: string;
  testID?: string;
};

/** What the stay added up to: period, reports sent, photos, tasks done and the last report's first line. */
export function StaySummaryCard({ summary, period, testID }: Props) {
  const styles = useThemedStyles(makeStyles);
  const stat = (value: number, label: string, id: string) => (
    <View style={styles.stat} testID={id}>
      <Text style={styles.value}>{value}</Text>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
  return (
    <Card style={styles.card} testID={testID}>
      <Text accessibilityRole="header" style={styles.title}>
        Stay summary
      </Text>
      <Text style={styles.muted}>{period}</Text>
      <View style={styles.stats}>
        {stat(summary.reports, summary.reports === 1 ? "daily note" : "daily notes", "summary-reports")}
        {stat(summary.photos, summary.photos === 1 ? "photo" : "photos", "summary-photos")}
        {stat(summary.tasksDone, summary.tasksDone === 1 ? "task done" : "tasks done", "summary-tasks")}
      </View>
      {summary.lastReport ? (
        <Text style={styles.quote} testID="summary-last-report">{`“${summary.lastReport}”`}</Text>
      ) : null}
    </Card>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    card: { gap: theme.spacing.sm },
    title: { fontSize: theme.fontSize.body, fontWeight: "700", color: theme.color.text },
    muted: { fontSize: theme.fontSize.small, color: theme.color.textMuted },
    stats: { flexDirection: "row", gap: theme.spacing.xs },
    stat: {
      flex: 1,
      alignItems: "center",
      paddingVertical: theme.spacing.xs,
      borderRadius: theme.radius.md,
      borderWidth: 1,
      borderColor: theme.color.border,
      backgroundColor: theme.color.surface,
    },
    value: { fontSize: theme.fontSize.title, fontWeight: "700", color: theme.color.text },
    label: { fontSize: theme.fontSize.small, color: theme.color.textMuted },
    quote: { fontSize: theme.fontSize.body, fontStyle: "italic", color: theme.color.text },
  });
