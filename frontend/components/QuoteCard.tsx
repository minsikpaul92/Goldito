import { StyleSheet, Text, View } from "react-native";

import { useThemedStyles } from "../providers/ThemeProvider";
import { Theme } from "../theme/themes";
import type { PriceQuote } from "../lib/bookings";
import { Card } from "./ui/Card";

type Props = {
  quote: PriceQuote;
  /** Compact line for inquiry cards later (07B). */
  compact?: boolean;
  /** Checkout (Figma): a white card with 26 corners, just the lines and the total. */
  plain?: boolean;
  testID?: string;
};

function money(n: number): string {
  return `$${n.toFixed(2)}`;
}

/** Breakdown from quote_booking — same numbers as Checkout and Pay (03C, D29). */
export function QuoteCard({ quote, compact, plain, testID }: Props) {
  const styles = useThemedStyles(makeStyles);
  // A same-day stay has 0 nights but is billed as 1 day (quote_booking), so it reads as a day.
  const unitLabel =
    quote.service !== "daycare" && quote.nights > 0
      ? `${quote.nights} night${quote.nights === 1 ? "" : "s"} × ${money(quote.unit_price)}`
      : `${quote.days} day${quote.days === 1 ? "" : "s"} × ${money(quote.unit_price)}`;

  if (compact) {
    return (
      <Card style={styles.card} testID={testID}>
        <Text style={styles.total}>{`Total ${money(quote.total)} ${quote.currency}`}</Text>
        <Text style={styles.muted}>{unitLabel}</Text>
      </Card>
    );
  }

  return (
    <Card style={plain ? styles.plain : styles.card} testID={testID}>
      {plain ? null : (
        <Text accessibilityRole="header" style={styles.title}>
          Your quote
        </Text>
      )}
      <View style={styles.row}>
        <Text style={styles.body} testID="quote-unit">
          {unitLabel}
        </Text>
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
      {(quote.extras ?? []).map((e, i) => (
        <View key={`${e.label}-${i}`} style={styles.row} testID={`quote-extra-${i}`}>
          <Text style={styles.body}>{e.label}</Text>
          <Text style={styles.body}>{money(e.amount)}</Text>
        </View>
      ))}
      <View style={[styles.row, styles.totalRow]}>
        <Text style={styles.total}>Total</Text>
        <Text style={styles.total} testID="quote-total">{`${money(quote.total)} ${quote.currency}`}</Text>
      </View>
      {plain ? null : <Text style={styles.muted}>Price is set at checkout. Demo payment, no card.</Text>}
    </Card>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    // Same look as the chat quote bubble (Figma): 14 padding, 16 corners, a little letter spacing.
    card: { gap: theme.spacing.sm, padding: 14, borderRadius: theme.radius.lg },
    plain: { gap: theme.spacing.xs, padding: 16, borderRadius: 26, borderWidth: 0, backgroundColor: theme.color.surface },
    title: { fontSize: theme.fontSize.body, fontWeight: theme.fontWeight.bold, letterSpacing: 0.3, color: theme.color.text },
    row: { flexDirection: "row", justifyContent: "space-between", gap: theme.spacing.md },
    totalRow: {
      marginTop: theme.spacing.xs,
      paddingTop: theme.spacing.sm,
      borderTopWidth: 1,
      borderTopColor: theme.color.border,
    },
    body: { fontSize: theme.fontSize.body, letterSpacing: 0.3, color: theme.color.text, flexShrink: 1 },
    total: { fontSize: theme.fontSize.body + 2, letterSpacing: 0.3, fontWeight: theme.fontWeight.bold, color: theme.color.text },
    muted: { fontSize: theme.fontSize.small, letterSpacing: 0.3, color: theme.color.textMuted },
  });
