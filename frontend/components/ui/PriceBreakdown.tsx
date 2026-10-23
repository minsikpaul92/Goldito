import { StyleSheet, Text, View } from "react-native";

import { useThemedStyles } from "../../providers/ThemeProvider";
import { Theme } from "../../theme/themes";

type Line = { label: string; amount: string };
type Props = {
  lines: Line[];
  total: string;
  /** Under the total: "All fees included" (quotes are all-inclusive since #272). */
  note?: string;
  testID?: string;
};

/** One price table for quotes, checkout and the sitter card spec (design site: steps.html, qa-sitter-card.html). Amounts come from the server. */
export function PriceBreakdown({ lines, total, note, testID }: Props) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.wrap} testID={testID}>
      {lines.map((l) => (
        <View key={l.label} style={styles.line}>
          <Text style={styles.label}>{l.label}</Text>
          <Text style={styles.amount}>{l.amount}</Text>
        </View>
      ))}
      <View style={[styles.line, styles.totalLine]}>
        <Text style={styles.totalLabel}>Total</Text>
        <Text style={styles.totalAmount}>{total}</Text>
      </View>
      {note ? <Text style={styles.note}>{note}</Text> : null}
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    wrap: { gap: theme.spacing.xs },
    line: { flexDirection: "row", justifyContent: "space-between", gap: theme.spacing.md },
    label: { flex: 1, fontSize: theme.fontSize.body, color: theme.color.textMuted },
    amount: { fontSize: theme.fontSize.body, color: theme.color.text, fontVariant: ["tabular-nums"] },
    totalLine: { marginTop: theme.spacing.xs, paddingTop: theme.spacing.sm, borderTopWidth: 1, borderTopColor: theme.color.border },
    totalLabel: { fontSize: theme.fontSize.body, fontWeight: theme.fontWeight.bold, color: theme.color.text },
    totalAmount: { fontSize: theme.fontSize.lead, fontWeight: theme.fontWeight.bold, color: theme.color.text, fontVariant: ["tabular-nums"] },
    note: { fontSize: theme.fontSize.small, color: theme.color.textMuted, textAlign: "right" },
  });
