import { StyleSheet, Text, View } from "react-native";

import { Button } from "./ui/Button";
import { Card } from "./ui/Card";
import { TextButton } from "./ui/TextButton";
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
  busy?: boolean;
  onAddFee: () => void;
  onAnswer: (extraId: string, accept: boolean) => void;
  onConfirm: () => void;
  /** The owner's no to a final quote (#230); shown under Confirm only when given. */
  onDecline?: () => void;
  /** "Suggest another price" (#230): given only for a final quote whose total changed since the first quote. */
  onCounter?: () => void;
};

const money = (n: number) => `$${n.toFixed(2)}`;
const SERVICE: Record<string, string> = { boarding: "Boarding", house_sitting: "House sitting", daycare: "Daycare" };

function short(iso: string): string {
  const z = isoToZoned(iso);
  return `${formatDay(z.day)} ${formatTime(z.time)}`;
}

/**
 * The sitter's quote in the chat (3D.6): the server's breakdown, the extra fees with the owner's answer on each, and the
 * total. Every number is read from the card; the model never writes a price (D29).
 */
export function ChatQuoteCard({ card, role, final, busy, onAddFee, onAnswer, onConfirm, onDecline, onCounter }: Props) {
  const styles = useThemedStyles(makeStyles);
  const q = card.quote;
  const open = card.status === "sent";
  const pending = card.extras.some((e) => e.status === "offered");
  const unit =
    q.service !== "daycare" && q.nights > 0
      ? `${q.nights} night${q.nights === 1 ? "" : "s"} × ${money(q.unit_price)}`
      : `${q.days} day${q.days === 1 ? "" : "s"} × ${money(q.unit_price)}`;

  return (
    <Card style={card.status === "replaced" ? styles.cardFaded : styles.card} testID="chat-quote-card">
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

      {card.extras.map((e) => (
        <View key={e.id} testID={`quote-extra-${e.status}`}>
          <View style={styles.row}>
            <Text style={[styles.body, e.status === "declined" && styles.struck]}>{e.label}</Text>
            <Text style={[styles.body, e.status === "declined" && styles.struck]}>{money(e.amount)}</Text>
          </View>
          {e.status === "offered" && open ? (
            role === "owner" ? (
              <View style={styles.answers}>
                <TextButton label="Decline" disabled={busy} onPress={() => onAnswer(e.id, false)} testID="quote-extra-decline" />
                <TextButton label="Accept" disabled={busy} onPress={() => onAnswer(e.id, true)} testID="quote-extra-accept" />
              </View>
            ) : (
              <Text style={styles.muted}>Waiting for an answer</Text>
            )
          ) : e.status === "declined" ? (
            <Text style={styles.muted}>Declined</Text>
          ) : null}
        </View>
      ))}

      <View style={[styles.row, styles.totalRow]}>
        <Text style={styles.total}>Total</Text>
        <Text style={styles.total} testID="quote-total">{`${money(card.total)} ${q.currency}`}</Text>
      </View>

      {open && role === "sitter" ? <TextButton label="Add a fee" disabled={busy} onPress={onAddFee} testID="quote-add-fee" /> : null}
      {open && role === "owner" ? (
        <Button label="Confirm quote" disabled={busy || pending} onPress={onConfirm} testID="quote-confirm" />
      ) : null}
      {open && role === "owner" && final && (onDecline || onCounter) ? (
        <View style={styles.links}>
          {onCounter ? <TextButton label="Suggest another price" disabled={busy} onPress={onCounter} testID="quote-counter" /> : null}
          {onDecline ? <TextButton label="Decline" danger disabled={busy} onPress={onDecline} testID="quote-decline" /> : null}
        </View>
      ) : null}
    </Card>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    card: { gap: theme.spacing.xs, maxWidth: "92%", width: "92%" },
    cardFaded: { gap: theme.spacing.xs, maxWidth: "92%", width: "92%", opacity: 0.5 },
    row: { flexDirection: "row", justifyContent: "space-between", gap: theme.spacing.md },
    links: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" },
    title: { fontSize: theme.fontSize.body, fontWeight: theme.fontWeight.bold, color: theme.color.text },
    body: { fontSize: theme.fontSize.body, color: theme.color.text, flexShrink: 1 },
    muted: { fontSize: theme.fontSize.small, color: theme.color.textMuted },
    ok: { fontSize: theme.fontSize.small, fontWeight: theme.fontWeight.bold, color: theme.color.primary },
    struck: { textDecorationLine: "line-through", color: theme.color.textMuted },
    answers: { flexDirection: "row", justifyContent: "flex-end", gap: theme.spacing.md },
    totalRow: { marginTop: theme.spacing.xs, paddingTop: theme.spacing.sm, borderTopWidth: 1, borderTopColor: theme.color.border },
    total: { fontSize: theme.fontSize.body, fontWeight: theme.fontWeight.bold, color: theme.color.text },
  });
