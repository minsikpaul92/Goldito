import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Button } from "./ui/Button";
import { Sheet } from "./ui/Sheet";
import { formatDay, formatTime, isoToZoned } from "../features/schedule/dates";
import { BookingSummary, Handoff, PetCare, agreeToBook, loadPetCare, quoteBookingFor } from "../lib/bookings";
import { useErrorDialog } from "../providers/ErrorDialogProvider";
import { useThemedStyles } from "../providers/ThemeProvider";
import { Theme } from "../theme/themes";

type Props = {
  visible: boolean;
  booking: BookingSummary;
  onClose: () => void;
  onAgreed: () => void;
};

function when(h: Handoff | null): string {
  if (!h) return "Not set";
  const z = isoToZoned(h.at);
  return `${formatDay(z.day)} ${formatTime(z.time)}`;
}

function where(h: Handoff | null, sitter: string): string {
  if (!h) return "";
  if (h.locationType === "sitter_home") return `${sitter}'s place`;
  if (h.locationType === "owner_home") return "Your place";
  return h.note ?? "Elsewhere";
}

/**
 * The owner's "I'd like to book" (3D.7): the checklist, pets, times and price once more, then one tap. The sitter's own
 * yes is on the card; the booking is confirmed when both are in.
 */
export function AgreeSheet({ visible, booking, onClose, onAgreed }: Props) {
  const styles = useThemedStyles(makeStyles);
  const errorDialog = useErrorDialog();
  const [care, setCare] = useState<PetCare[] | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    const ids = booking.pets.flatMap((p) => (p.id ? [p.id] : []));
    loadPetCare(ids)
      .then(setCare)
      .catch(() => setCare(null));
    quoteBookingFor(booking.id)
      .then((q) => setTotal(q.total))
      .catch(() => setTotal(null));
  }, [visible, booking.id, booking.pets]);

  const agree = async () => {
    setSaving(true);
    try {
      await agreeToBook(booking.id);
      onClose();
      onAgreed();
    } catch (e) {
      errorDialog.show({ title: "Not saved", message: (e as Error).message, onRetry: () => void agree() });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      visible={visible}
      title={`Book ${booking.sitterName}`}
      onClose={onClose}
      testID="agree-sheet"
      footer={<Button label="I'd like to book" disabled={saving} onPress={() => void agree()} testID="agree-submit" />}
    >
      <View style={styles.block}>
        <Text style={styles.label}>Pets</Text>
        <Text style={styles.line}>{booking.pets.map((p) => p.name).join(", ")}</Text>
      </View>
      <View style={styles.block}>
        <Text style={styles.label}>Times</Text>
        <Text style={styles.line}>{`Drop-off ${when(booking.dropOff)} · ${where(booking.dropOff, booking.sitterName)}`}</Text>
        <Text style={styles.line}>{`Pick-up ${when(booking.pickUp)} · ${where(booking.pickUp, booking.sitterName)}`}</Text>
      </View>
      {care && care.length > 0 ? (
        <View style={styles.block}>
          <Text style={styles.label}>Care checklist</Text>
          {care.map((p) => (
            <Text key={p.id} style={styles.line} testID={`agree-care-${p.name}`}>
              {`${p.name}: ${p.tasks.length} task${p.tasks.length === 1 ? "" : "s"}${p.cautions.length > 0 ? `, ${p.cautions.length} heads-up` : ""}`}
            </Text>
          ))}
        </View>
      ) : null}
      {total != null ? (
        <View style={styles.block}>
          <Text style={styles.label}>Price</Text>
          <Text style={styles.line} testID="agree-price">{`$${total.toFixed(2)}`}</Text>
        </View>
      ) : null}
    </Sheet>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    block: { gap: 2 },
    label: { fontSize: theme.fontSize.small, fontWeight: theme.fontWeight.semibold, color: theme.color.textMuted },
    line: { fontSize: theme.fontSize.body, color: theme.color.text },
  });
