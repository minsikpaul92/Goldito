import { StyleSheet, Text, View } from "react-native";

import { Button } from "./ui/Button";
import { Card } from "./ui/Card";
import { ChatCard } from "../features/chat/chatApi";
import { formatDay, formatTime, isoToZoned } from "../features/schedule/dates";
import { useThemedStyles } from "../providers/ThemeProvider";
import { Theme } from "../theme/themes";

type QuoteCardData = Extract<ChatCard, { type: "quote" }>;

type Props = {
  card: QuoteCardData;
  role: "owner" | "sitter";
  /** Sent after the booking's payment card: the price the owner pays (3D.8, #235). */
  final?: boolean;
  /** Who sent it and when, shown small above the quote ("Chloe · Oct 25 4:05 PM"). */
  from?: string;
  busy?: boolean;
  onConfirm: () => void;
  /** The owner's no to a final quote (#230); shown under Confirm only when given. */
  onDecline?: () => void;
};


const money = (n: number) => `$${n.toFixed(2)}`;
const SERVICE: Record<string, string> = { boarding: "Boarding", house_sitting: "House sitting", daycare: "Daycare" };

function short(iso: string): string {
  const z = isoToZoned(iso);
  return `${formatDay(z.day)} ${formatTime(z.time)}`;
}

/**
 * The sitter's quote in the chat (3D.6): the server's breakdown and one all-inclusive total (#265: no extra fees).
 * Every number is read from the card; the model never writes a price (D29). A quote sent before #265 may still hold
 * fee lines: an accepted one is part of its total and shows as a plain line; an unanswered one can't be answered any
 * more, so the card says a new quote replaces it.
 */
export function ChatQuoteCard({ card, role, final, from, busy, onConfirm, onDecline }: Props) {
  const styles = useThemedStyles(makeStyles);
  const q = card.quote;
  const open = card.status === "sent";
  const pending = card.extras.some((e) => e.status === "offered");
  const unit =
    q.service !== "daycare" && q.nights > 0
      ? `${q.nights} night${q.nights === 1 ? "" : "s"} × ${money(q.unit_price)}`
      : `${q.days} day${q.days === 1 ? "" : "s"} × ${money(q.unit_price)}`;

  return (
    <Card
      style={card.status === "replaced" ? styles.cardFaded : styles.card}
      testID="chat-quote-card"
    >
      {from ? <Text style={styles.from}>{from}</Text> : null}
      <View style={styles.row}>
        <Text style={styles.title} testID="quote-title">{final ? "Final quote" : "Quote"}</Text>
        {card.status === "confirmed" ? <Text style={styles.ok} testID="quote-status">Confirmed</Text> : null}
        {card.status === "replaced" ? <Text style={styles.muted} testID="quote-status">Replaced</Text> : null}
      </View>
      <Text style={styles.muted}>{`${SERVICE[card.serviceType] ?? card.serviceType} · ${card.pets.map((p) => p.name).join(", ")}`}</Text>
      <Text style={styles.muted}>{`${short(card.dropOffAt)} to ${short(card.pickUpAt)}`}</Text>

      <View style={styles.row}>
        <Text style={styles.body}>{unit}</Text>
        <Text style={styles.body}>{money(q.base)}</Text>
      </View>
      {q.extra_pets > 0 ? (
        <View style={styles.row}>
          <Text style={styles.body}>Extra pet</Text>
          <Text style={styles.body}>{money(q.extra_pets)}</Text>
        </View>
      ) : null}
      {q.holiday_surcharge > 0 ? (
        <View style={styles.row}>
          <Text style={styles.body}>Holiday</Text>
          <Text style={styles.body}>{money(q.holiday_surcharge)}</Text>
        </View>
      ) : null}

      {card.extras
        .filter((e) => e.status === "accepted")
        .map((e) => (
          <View key={e.id} style={styles.row} testID="quote-extra-accepted">
            <Text style={styles.body}>{e.label}</Text>
            <Text style={styles.body}>{money(e.amount)}</Text>
          </View>
        ))}

      <View style={[styles.row, styles.totalRow]}>
        <Text style={styles.total}>Total</Text>
        <Text style={styles.total} testID="quote-total">{`${money(card.total)} ${q.currency}`}</Text>
      </View>

      {open && pending ? (
        <Text style={styles.muted} testID="quote-legacy-fee">
          This older quote has a fee no one can answer now. A new quote replaces it.
        </Text>
      ) : null}
      {open && role === "owner" ? (
        <View style={styles.actions}>
          <Button label="Confirm" disabled={busy || pending} onPress={onConfirm} testID="quote-confirm" />
          {final && onDecline ? <Button label="Decline" variant="danger" disabled={busy} onPress={onDecline} testID="quote-decline" /> : null}
        </View>
      ) : null}
    </Card>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    // Figma owner quote bubble: 14 padding, 16 corners, same for both roles, the sender's name small on top.
    card: { gap: theme.spacing.xs, maxWidth: "92%", width: "92%", padding: 14, borderRadius: theme.radius.lg, backgroundColor: theme.color.cardGround, borderColor: theme.color.cardLine },
    cardFaded: { gap: theme.spacing.xs, maxWidth: "92%", width: "92%", padding: 14, borderRadius: theme.radius.lg, backgroundColor: theme.color.cardGround, borderColor: theme.color.cardLine, opacity: 0.5 },
    row: { flexDirection: "row", justifyContent: "space-between", gap: theme.spacing.md },
    actions: { gap: theme.spacing.sm, marginTop: theme.spacing.md },
    from: { fontSize: 11, fontWeight: theme.fontWeight.bold, letterSpacing: 0.33, textTransform: "uppercase", color: theme.color.cardTextMuted },
    title: { fontSize: theme.fontSize.body, fontWeight: theme.fontWeight.bold, letterSpacing: 0.3, color: theme.color.cardText },
    body: { fontSize: theme.fontSize.body, letterSpacing: 0.3, color: theme.color.cardText, flexShrink: 1 },
    muted: { fontSize: theme.fontSize.small, letterSpacing: 0.3, color: theme.color.cardTextMuted },
    ok: { fontSize: theme.fontSize.small, fontWeight: theme.fontWeight.bold, color: theme.color.primary },
    totalRow: { marginTop: theme.spacing.xs, paddingTop: theme.spacing.sm, borderTopWidth: 1, borderTopColor: theme.color.cardLine },
    total: { fontSize: theme.fontSize.body + 2, letterSpacing: 0.3, fontWeight: theme.fontWeight.bold, color: theme.color.cardText },
  });
