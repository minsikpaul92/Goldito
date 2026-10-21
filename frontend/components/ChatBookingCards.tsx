import { Pressable, StyleSheet, Text } from "react-native";

import { Card } from "./ui/Card";
import { BookingSummary } from "../lib/bookings";
import { useThemedStyles } from "../providers/ThemeProvider";
import { Theme } from "../theme/themes";

const money = (n: number) => `$${n.toFixed(2)}`;

/** A card for a booking that ended before it was agreed or paid. */
function endedLine(b: BookingSummary): string | null {
  return b.status === "cancelled" ? "Cancelled" : b.status === "declined" ? "Declined" : null;
}

/**
 * Both people's yes to book (3D.7): the owner's "I'd like to book" and the sitter's "I accept", read from the booking.
 * Once both are in it folds to one line.
 */
export function ChatAgreementCard({ booking }: { booking: BookingSummary }) {
  const styles = useThemedStyles(makeStyles);
  const ended = endedLine(booking);
  const both = !!booking.ownerAgreedAt && !!booking.sitterAcceptedAt;

  if (ended || both) {
    return (
      <Card style={styles.card} testID="chat-agreement-card">
        <Text style={styles.title}>{ended ?? "Booked, you both agreed ✓"}</Text>
      </Card>
    );
  }
  return (
    <Card style={styles.card} testID="chat-agreement-card">
      <Text style={styles.title}>Book {booking.sitterName}</Text>
      <Text style={styles.line} testID="agreement-owner">
        {booking.ownerAgreedAt ? `✓ ${booking.ownerName} would like to book` : `${booking.ownerName}: not yet`}
      </Text>
      <Text style={styles.line} testID="agreement-sitter">
        {booking.sitterAcceptedAt ? `✓ ${booking.sitterName} accepts` : `${booking.sitterName}: not yet`}
      </Text>
    </Card>
  );
}

type PaymentProps = {
  booking: BookingSummary;
  viewer: "owner" | "sitter";
  /** The total payment will freeze: the confirmed final quote's, or the frozen price once paid. */
  total: number | null;
  /** The owner may pay now (the final quote is confirmed): the card opens Checkout. */
  canPay: boolean;
  onPay: () => void;
};

/**
 * The payment (3D.7). The owner pays on Checkout, a demo with no card data; the money is held until the stay ends.
 */
export function ChatPaymentCard({ booking, viewer, total, canPay, onPay }: PaymentProps) {
  const styles = useThemedStyles(makeStyles);
  const ended = endedLine(booking);
  const paid = !!booking.paidAt;
  const amount = paid ? (booking.priceSnapshot?.total ?? total) : total;

  const body = (
    <Card style={styles.card} testID="chat-payment-card">
      <Text style={styles.title}>{ended ?? (paid ? "Paid" : "Payment")}</Text>
      {ended && booking.refundedAt && viewer === "owner" ? (
        <Text style={styles.line} testID="payment-refunded">
          {`Refunded in full${booking.priceSnapshot?.total != null ? ` · ${money(booking.priceSnapshot.total)}` : ""}`}
        </Text>
      ) : null}
      {ended ? null : (
        <>
          {amount != null ? <Text style={styles.total} testID="payment-total">{money(amount)}</Text> : null}
          <Text style={styles.line}>
            {paid
              ? "Held until the stay ends"
              : viewer === "owner"
                ? canPay
                  ? "Tap to pay. Held until the stay ends."
                  : "Pay once the final quote is confirmed."
                : `Waiting for ${booking.ownerName} to pay`}
          </Text>
        </>
      )}
    </Card>
  );
  if (!canPay || paid || ended) return body;
  return (
    <Pressable accessibilityRole="button" onPress={onPay} testID="chat-payment-open">
      {body}
    </Pressable>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    card: { gap: 2, maxWidth: "92%", width: "92%" },
    title: { fontSize: theme.fontSize.body, fontWeight: theme.fontWeight.bold, color: theme.color.text },
    line: { fontSize: theme.fontSize.small, color: theme.color.textMuted },
    total: { fontSize: theme.fontSize.title, fontWeight: theme.fontWeight.bold, color: theme.color.text },
  });
