import { useState } from "react";
import { Pressable, StyleSheet, Text } from "react-native";

import { formatInstant } from "../features/schedule/dates";
import { BookingSummary } from "../lib/bookings";
import { loadLocal, saveLocal } from "../lib/localState";
import { useThemedStyles } from "../providers/ThemeProvider";
import { Theme } from "../theme/themes";

const key = (bookingId: string) => `goldito:paid-seen:${bookingId}`;

/**
 * The "you're done" card after checkout (FB-12). A toast is gone in 3 seconds, so the confirmation stays
 * on the booking until the owner taps it away (remembered on this device). It says what was paid, when
 * the pets go, and that nothing else is needed.
 */
export function PaidConfirmation({ booking }: { booking: BookingSummary }) {
  const styles = useThemedStyles(makeStyles);
  const [seen, setSeen] = useState(() => loadLocal(key(booking.id), false));
  if (!booking.paidAt || seen) return null;

  const pets = booking.pets.map((p) => p.name).join(" & ") || "your pet";
  const total = booking.priceSnapshot?.total;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Booked and paid. Tap to dismiss"
      onPress={() => {
        saveLocal(key(booking.id), true);
        setSeen(true);
      }}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      testID="paid-confirmation"
    >
      <Text style={styles.title}>{total != null ? `Booked and paid: $${total.toFixed(2)} CAD` : "Booked and paid"}</Text>
      {booking.dropOff ? <Text style={styles.body}>{`Drop-off ${formatInstant(booking.dropOff.at)}`}</Text> : null}
      <Text style={styles.body}>{`Nothing else to do. We'll tell you when ${booking.sitterName} receives ${pets}.`}</Text>
      <Text style={styles.muted}>Tap to dismiss</Text>
    </Pressable>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    card: {
      gap: theme.spacing.xs,
      padding: theme.spacing.md,
      borderRadius: theme.radius.lg,
      borderWidth: 1,
      borderColor: theme.color.primary,
      backgroundColor: theme.color.accent,
    },
    title: { fontSize: theme.fontSize.body, fontWeight: "600", color: theme.color.text },
    body: { fontSize: theme.fontSize.body, color: theme.color.text },
    muted: { fontSize: theme.fontSize.small, color: theme.color.textMuted },
    pressed: { opacity: 0.8 },
  });
