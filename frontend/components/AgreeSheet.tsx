import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { HandoffChangeSheet } from "./HandoffChangeSheet";
import { Button } from "./ui/Button";
import { Sheet } from "./ui/Sheet";
import { formatDay, formatTime, isoToZoned } from "../features/schedule/dates";
import {
  BookingError,
  BookingSummary,
  Handoff,
  PetCare,
  agreeToBook,
  loadPetCare,
  proposeHandoff,
  proposeHandoffPair,
  quoteBookingFor,
} from "../lib/bookings";
import { useErrorDialog } from "../providers/ErrorDialogProvider";
import { useThemedStyles } from "../providers/ThemeProvider";
import { useToast } from "../providers/ToastProvider";
import { Theme } from "../theme/themes";

type Props = {
  visible: boolean;
  booking: BookingSummary;
  onClose: () => void;
  onAgreed: () => void;
  /** New times were sent from inside the sheet: the screen reloads the booking. */
  onChanged: () => void;
};

/** The server refuses a time that has passed; Try again can never work, so the owner picks new times (#364). */
const EXPIRED = ["proposal_expired", "request_expired"];

/** A handoff not done yet whose time has passed. */
const passed = (h: Handoff | null) => !!h && !h.completedAt && Date.parse(h.at) <= Date.now();

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
 * The owner's Accept (3D.7; Accept is the one yes word, U12): the checklist, pets, times and price once more, then one tap. The sitter's own
 * yes is on the card; the booking is confirmed when both are in.
 */
export function AgreeSheet({ visible, booking, onClose, onAgreed, onChanged }: Props) {
  const styles = useThemedStyles(makeStyles);
  const errorDialog = useErrorDialog();
  const toast = useToast();
  const [care, setCare] = useState<PetCare[] | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  /** The server said a time has passed (the clock here may not know yet). */
  const [refused, setRefused] = useState(false);
  const [picking, setPicking] = useState<number | null>(null);

  useEffect(() => {
    if (visible) setRefused(false);
  }, [visible]);

  // A time that has passed can't be agreed: say which one and offer new times instead of Accept.
  const expired = passed(booking.dropOff)
    ? "Drop-off time has passed."
    : passed(booking.pickUp)
      ? "Pick-up time has passed."
      : refused
        ? "That time has passed."
        : null;

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
      if (e instanceof BookingError && EXPIRED.includes(e.code)) setRefused(true);
      else errorDialog.show({ title: "Not saved", message: (e as Error).message, onRetry: () => void agree() });
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
      footer={
        expired ? (
          <Button label="Pick new times" onPress={() => setPicking(Date.now())} testID="agree-new-times" />
        ) : (
          <Button label="Accept" disabled={saving} onPress={() => void agree()} testID="agree-submit" />
        )
      }
    >
      <View style={styles.block}>
        <Text style={styles.label}>Pets</Text>
        <Text style={styles.line}>{booking.pets.map((p) => p.name).join(", ")}</Text>
      </View>
      <View style={styles.block}>
        <Text style={styles.label}>Times</Text>
        <Text style={styles.line}>{`Drop-off ${when(booking.dropOff)} · ${where(booking.dropOff, booking.sitterName)}`}</Text>
        <Text style={styles.line}>{`Pick-up ${when(booking.pickUp)} · ${where(booking.pickUp, booking.sitterName)}`}</Text>
        {expired ? (
          <Text accessibilityRole="alert" style={styles.expired} testID="agree-expired">
            {expired}
          </Text>
        ) : null}
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
      {picking != null ? (
        <HandoffChangeSheet
          key={picking}
          visible
          booking={booking}
          viewer="owner"
          initialKind={passed(booking.dropOff) || !passed(booking.pickUp) ? "drop_off" : "pick_up"}
          allowPlace={false}
          title="Pick new times"
          submitLabel={`Send to ${booking.sitterName}`}
          onSend={(c) => proposeHandoff(booking.id, c.kind, c.at, c.place)}
          onSendPair={(drop, pick) => proposeHandoffPair(booking.id, drop, pick)}
          onChanged={onChanged}
          onDone={() => {
            setPicking(null);
            setRefused(false);
            toast.show(`Sent to ${booking.sitterName}`);
          }}
          onClose={() => setPicking(null)}
        />
      ) : null}
    </Sheet>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    block: { gap: 2 },
    label: { fontSize: theme.fontSize.small, fontWeight: theme.fontWeight.semibold, color: theme.color.textMuted },
    line: { fontSize: theme.fontSize.body, color: theme.color.text },
    expired: { fontSize: theme.fontSize.small, fontWeight: theme.fontWeight.semibold, color: theme.color.error },
  });
