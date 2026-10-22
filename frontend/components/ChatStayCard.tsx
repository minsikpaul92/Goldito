import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { ChatReviewCard } from "./ChatReviewCard";
import { ReturnSheet } from "./ReturnSheet";
import { Button } from "./ui/Button";
import { Card } from "./ui/Card";
import { requestLifeRecord } from "../features/completion/completionApi";
import { formatInstant } from "../features/schedule/dates";
import { BookingSummary, completeHandoff } from "../lib/bookings";
import { useErrorDialog } from "../providers/ErrorDialogProvider";
import { useThemedStyles } from "../providers/ThemeProvider";
import { useToast } from "../providers/ToastProvider";
import { Theme } from "../theme/themes";

type Props = { booking: BookingSummary; viewer: "owner" | "sitter"; onChanged: () => void };

/**
 * The pets changing hands, in the chat (3D.8): "with {sitter}" for the owner while they are in care, the sitter's
 * Returned (the same sheet as the booking page), then "Home safe". Received is on the trip card, after the arrival
 * (#250). Reads the booking; the trip card above it brings them to the door.
 */
export function ChatStayCard({ booking, viewer, onChanged }: Props) {
  const styles = useThemedStyles(makeStyles);
  const errorDialog = useErrorDialog();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [returning, setReturning] = useState(false);
  const sitter = viewer === "sitter";
  const pets = booking.pets.map((p) => p.name).join(" & ") || "The pets";
  const are = booking.pets.length > 1 ? "are" : "is";

  if (booking.status !== "confirmed" || !booking.paidAt) return null;

  const run = async (action: () => Promise<void>, done: string) => {
    setBusy(true);
    try {
      await action();
      toast.show(done);
      onChanged();
    } catch (e) {
      errorDialog.show({ title: "Not saved", message: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const received = booking.dropOff?.completedAt;
  const returned = booking.pickUp?.completedAt;

  if (returned) {
    return (
      <View style={styles.wrap}>
        <Card style={styles.card} testID="chat-stay-home">
          <Text style={styles.title}>Home safe 🏠</Text>
          <Text style={styles.muted}>{`${pets} ${sitter ? `went home with ${booking.ownerName}` : `${are} back with you`}`}</Text>
        </Card>
        <ChatReviewCard booking={booking} viewer={viewer} />
      </View>
    );
  }

  if (received) {
    return (
      <View style={styles.wrap}>
        <Card style={styles.card} testID="chat-stay-incare">
          <Text style={styles.title}>{sitter ? `${pets} ${are} with you 🐾` : `${pets} ${are} with ${booking.sitterName} 🐾`}</Text>
          <Text style={styles.muted}>{`Received ${formatInstant(received)}`}</Text>
          {sitter ? (
            <Button label="Returned" onPress={() => setReturning(true)} disabled={busy} testID="chat-returned" />
          ) : null}
        </Card>
        {sitter ? (
          <ReturnSheet
            visible={returning}
            booking={booking}
            ownerName={booking.ownerName}
            onClose={() => setReturning(false)}
            onConfirm={() =>
              void run(async () => {
                await completeHandoff(booking.id, "pick_up");
                // The stay is over: write the Life Record in the background (the owner's booking page retries if this fails).
                void requestLifeRecord(booking.id).catch(() => undefined);
              }, `${pets} home safe. ${booking.ownerName} gets a notice`)
            }
          />
        ) : null}
      </View>
    );
  }

  // Not received yet: nothing here. Received is on the trip card once the drop-off trip got there (#250); with no trip
  // at all the booking page keeps its Received (from 2 hours before, the server's rule).
  return null;
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    wrap: { width: "100%", alignItems: "center", gap: theme.spacing.sm },
    card: { gap: theme.spacing.sm, maxWidth: "92%", width: "92%" },
    title: { fontSize: theme.fontSize.body, fontWeight: theme.fontWeight.bold, color: theme.color.text },
    muted: { fontSize: theme.fontSize.small, color: theme.color.textMuted },
  });
