import { useState } from "react";
import { StyleSheet, Text } from "react-native";

import { ChipSuggestions } from "./ChipSuggestions";
import { Button } from "./ui/Button";
import { Sheet } from "./ui/Sheet";
import { TextField } from "./ui/TextField";
import { composeComment } from "../features/completion/reviewPresets";
import { OWNER_PASS_REASONS, SITTER_DECLINE_REASONS, cancelBooking, respondBooking } from "../lib/bookings";
import { releaseVideoLink } from "../lib/meetGreet";
import { useThemedStyles } from "../providers/ThemeProvider";
import { useToast } from "../providers/ToastProvider";
import { Theme } from "../theme/themes";

/** The owner's extra reason when the no is about the final quote. */
const PRICE_REASON = "The price doesn't work";

type Props = {
  visible: boolean;
  bookingId: string;
  role: "owner" | "sitter";
  /** The other person, for the notice line. */
  otherName: string;
  /** The owner is saying no to the final quote (adds a price reason). */
  quote?: boolean;
  onClose: () => void;
  /** After the booking ended; the chat reloads. */
  onDone: () => void;
};

/**
 * Decline in the chat at the agreement step or on the final quote (#230). The owner's no is cancel_booking (like
 * "Not this sitter" on the booking page), the sitter's is respond_booking(false) (like Decline on a request). Either
 * ends the request, frees the held dates and tells the other side. A reason is optional.
 */
export function ChatDeclineSheet({ visible, bookingId, role, otherName, quote, onClose, onDone }: Props) {
  const styles = useThemedStyles(makeStyles);
  const toast = useToast();
  const reasons = role === "sitter" ? SITTER_DECLINE_REASONS : quote ? [PRICE_REASON, ...OWNER_PASS_REASONS] : OWNER_PASS_REASONS;
  const [picked, setPicked] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    if (busy) return;
    setPicked([]);
    setNote("");
    setError(null);
    onClose();
  };

  const decline = async () => {
    setBusy(true);
    setError(null);
    const reason = composeComment(picked, note) || null;
    try {
      if (role === "owner") await cancelBooking(bookingId, reason ?? "Owner declined");
      else await respondBooking(bookingId, false, reason);
      // A video Meet & Greet's Calendar event goes with the booking (3B.11).
      await releaseVideoLink(bookingId);
      toast.show(role === "owner" ? "Request ended" : "Request declined");
      setPicked([]);
      setNote("");
      onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      dirty={note.trim() !== ""}
      discardTitle="Discard your note?"
      visible={visible}
      title={quote ? "Decline the final quote?" : role === "owner" ? "Not this sitter?" : "Decline this booking?"}
      onClose={close}
      testID="chat-decline-sheet"
      footer={
        <Button
          label={busy ? "Declining…" : "Decline and end the request"}
          variant="danger"
          disabled={busy}
          onPress={() => void decline()}
          testID="chat-decline-confirm"
        />
      }
    >
      <Text style={styles.body}>{`${otherName} gets a notice and the dates are free again.`}</Text>
      <ChipSuggestions
        chips={reasons.map((r, i) => ({ id: String(i), kind: "episode", label: r, source: "custom", check: null, media_id: null }))}
        off={new Set(reasons.flatMap((r, i) => (picked.includes(r) ? [] : [String(i)])))}
        onToggle={(id) => {
          const r = reasons[Number(id)];
          setPicked((prev) => (prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r]));
        }}
        testIDPrefix="chat-decline-reason"
      />
      <TextField
        label={`Note to ${otherName} (optional)`}
        value={note}
        multiline
        numberOfLines={3}
        maxLength={200}
        onChangeText={setNote}
        testID="chat-decline-note"
      />
      {error ? (
        <Text accessibilityRole="alert" style={styles.error} testID="chat-decline-error">
          {error}
        </Text>
      ) : null}
    </Sheet>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    body: { fontSize: theme.fontSize.body, color: theme.color.text },
    error: { fontSize: theme.fontSize.small, color: theme.color.error },
  });
