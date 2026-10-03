import { StyleSheet, Text, View } from "react-native";

import { useThemedStyles } from "../providers/ThemeProvider";
import { Theme } from "../theme/themes";
import type { PriceQuote } from "../lib/bookings";
import { Card } from "./ui/Card";

type Props = {
  quote: PriceQuote;
  /** Compact line for inquiry cards later (07B). */
  compact?: boolean;
  testID?: string;
};

function money(n: number): string {
  return `$${n.toFixed(2)}`;
}

/** Breakdown from quote_booking — same numbers as Checkout and Pay (03C, D29). */
export function QuoteCard({ quote, compact, testID }: Props) {
  const styles = useThemedStyles(makeStyles);
  const unitLabel =
    quote.service === "daycare"
      ? `${quote.days} day${quote.days === 1 ? "" : "s"} × ${money(quote.unit_price)}`
      : `${quote.nights} night${quote.nights === 1 ? "" : "s"} × ${money(quote.unit_price)}`;

  if (compact) {
    return (
      <Card style={styles.card} testID={testID}>
        <Text style={styles.total}>{`Total ${money(quote.total)} ${quote.currency}`}</Text>
        <Text style={styles.muted}>{unitLabel}</Text>
      </Card>
    );
  }

  return (
    <Card style={styles.card} testID={testID}>
      <Text accessibilityRole="header" style={styles.title}>
        Your quote
      </Text>
      <View style={styles.row}>
        <Text style={styles.body}>{unitLabel}</Text>
        <Text style={styles.body}>{money(quote.base)}</Text>
      </View>
      {quote.extra_pets > 0 ? (
        <View style={styles.row}>
          <Text style={styles.body}>Extra pet</Text>
          <Text style={styles.body}>{money(quote.extra_pets)}</Text>
        </View>
      ) : null}
      {quote.holiday_surcharge > 0
        ? quote.holiday_days.map((h) => (
            <View key={h.day} style={styles.row}>
              <Text style={styles.body}>{`${h.name} (${h.day.slice(5)})`}</Text>
              <Text style={styles.body}>
                {quote.holiday_days.length === 1 ? money(quote.holiday_surcharge) : ""}
              </Text>
            </View>
          ))
        : null}
      {quote.holiday_surcharge > 0 && quote.holiday_days.length > 1 ? (
        <View style={styles.row}>
          <Text style={styles.body}>Holiday surcharge</Text>
          <Text style={styles.body}>{money(quote.holiday_surcharge)}</Text>
        </View>
      ) : null}
      <View style={[styles.row, styles.totalRow]}>
        <Text style={styles.total}>Total</Text>
        <Text style={styles.total} testID="quote-total">{`${money(quote.total)} ${quote.currency}`}</Text>
      </View>
      <Text style={styles.muted}>Price is set at checkout — demo payment, no card.</Text>
    </Card>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    card: { gap: theme.spacing.sm },
    title: { fontSize: theme.fontSize.body, fontWeight: "700", color: theme.color.text },
    row: { flexDirection: "row", justifyContent: "space-between", gap: theme.spacing.md },
    totalRow: {
      marginTop: theme.spacing.xs,
      paddingTop: theme.spacing.sm,
      borderTopWidth: 1,
      borderTopColor: theme.color.border,
    },
    body: { fontSize: theme.fontSize.body, color: theme.color.text, flexShrink: 1 },
    total: { fontSize: theme.fontSize.body, fontWeight: "700", color: theme.color.text },
    muted: { fontSize: theme.fontSize.small, color: theme.color.textMuted },
  });
