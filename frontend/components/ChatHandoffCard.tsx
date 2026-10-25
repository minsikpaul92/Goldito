import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { HandoffChange, HandoffChangeSheet } from "./HandoffChangeSheet";
import { placeLabel } from "./BookingCard";
import { Button } from "./ui/Button";
import { Card } from "./ui/Card";
import { TextButton } from "./ui/TextButton";
import { showsProposal } from "./ProposalCard";
import { fitsWays, loadSitterWays } from "../features/chat/handoffDefaults";
import { formatInstant } from "../features/schedule/dates";
import {
  BookingSummary,
  HandoffKind,
  LocationType,
  pairedProposal,
  proposeHandoff,
  proposeHandoffPair,
  respondHandoff,
} from "../lib/bookings";
import { useErrorDialog } from "../providers/ErrorDialogProvider";
import { useThemedStyles } from "../providers/ThemeProvider";
import { useToast } from "../providers/ToastProvider";
import { Theme } from "../theme/themes";

type Props = {
  booking: BookingSummary;
  viewer: "owner" | "sitter";
  onChanged: () => void;
  /** The + menu's Date change: opens the suggestion sheet each time this number goes up. */
  openSignal?: number;
};

const KINDS: HandoffKind[] = ["drop_off", "pick_up"];
const LABEL: Record<HandoffKind, string> = { drop_off: "Drop-off", pick_up: "Pick-up" };

/**
 * The handoff in the chat (3D.8): the other person's open suggestion for the drop-off and pick-up (one card, one Accept
 * for the pair), or, for the sitter, a request whose places differ from their default (#145). Reads the booking; the
 * sheet is the same one the booking page uses.
 */
export function ChatHandoffCard({ booking, viewer, onChanged, openSignal = 0 }: Props) {
  const styles = useThemedStyles(makeStyles);
  const errorDialog = useErrorDialog();
  const toast = useToast();
  const [sheet, setSheet] = useState<{ key: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [ways, setWays] = useState<LocationType[] | null>(null);
  const owner = viewer === "owner";
  const other = owner ? booking.sitterName : booking.ownerName;
  const me = owner ? booking.ownerId : booking.sitterId;

  useEffect(() => {
    if (openSignal > 0) setSheet({ key: Date.now() });
  }, [openSignal]);

  useEffect(() => {
    if (owner) return;
    loadSitterWays(booking.sitterId)
      .then(setWays)
      .catch(() => undefined);
  }, [owner, booking.sitterId]);

  // Their open suggestion first (Accept / Suggest another); else mine, which only waits.
  const theirs = KINDS.filter((k) => showsProposal(booking, viewer, k) && booking.pending[k]?.proposedBy !== me);
  const own = KINDS.filter((k) => {
    const done = (k === "drop_off" ? booking.dropOff : booking.pickUp)?.completedAt;
    return !done && booking.pending[k]?.proposedBy === me && ["requested", "confirmed"].includes(booking.status);
  });
  const open = theirs.length > 0 ? theirs : own;
  const offers = open.flatMap((k) => (booking.pending[k] ? [{ kind: k, step: booking.pending[k]! }] : []));
  const mine = theirs.length === 0 && own.length > 0;
  const paired = open.length === 2 && !!pairedProposal(booking, "drop_off");

  // The sitter's cue: the request's places are not the ones they prefer, and nobody has suggested anything yet.
  const request = booking.status === "requested" && !booking.sitterAcceptedAt;
  const differs =
    !owner &&
    request &&
    offers.length === 0 &&
    !!booking.dropOff &&
    !!booking.pickUp &&
    booking.serviceType !== "house_sitting" &&
    !(fitsWays(ways, booking.dropOff.locationType) && fitsWays(ways, booking.pickUp.locationType));

  const line = (kind: HandoffKind, at: string, type: LocationType, note: string | null) =>
    `${LABEL[kind]} ${formatInstant(at)} · ${placeLabel(type, note, booking, viewer)}`;

  const accept = async () => {
    setBusy(true);
    try {
      // A pair is answered with one call; two separate suggestions one by one.
      for (const o of paired ? offers.slice(0, 1) : offers) await respondHandoff(o.step.id, true);
      toast.show("Handoff agreed");
      onChanged();
    } catch (e) {
      errorDialog.show({ title: "Not saved", message: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const sendChange = async (c: HandoffChange) => proposeHandoff(booking.id, c.kind, c.at, c.place);
  const sendPair = async (drop: HandoffChange, pick: HandoffChange) => proposeHandoffPair(booking.id, drop, pick);

  const lines = differs
    ? [
        line("drop_off", booking.dropOff!.at, booking.dropOff!.locationType, booking.dropOff!.note),
        line("pick_up", booking.pickUp!.at, booking.pickUp!.locationType, booking.pickUp!.note),
      ]
    : offers.map((o) => line(o.kind, o.step.at, o.step.locationType, o.step.note));

  const showCard = offers.length > 0 || differs;
  return (
    <View style={styles.wrap}>
      {showCard ? (
      <Card tone="blush" style={styles.card} testID="chat-handoff-card">
        <Text style={styles.title}>
          {differs
            ? "Handoff differs from your default"
            : mine
              ? `Waiting for ${other}`
              : paired
                ? `${other} suggested a new drop-off and pick-up`
                : `${other} suggested a new ${LABEL[offers[0].kind].toLowerCase()}`}
        </Text>
        {lines.map((l) => (
          <Text key={l} style={styles.line} testID="chat-handoff-line">
            {l}
          </Text>
        ))}
        {!mine ? (
          <View style={styles.actions}>
            {!differs ? <Button label="Accept" onPress={() => void accept()} disabled={busy} testID="chat-handoff-accept" /> : null}
            <TextButton label="Suggest another" onPress={() => setSheet({ key: Date.now() })} testID="chat-handoff-suggest" />
          </View>
        ) : null}
      </Card>
      ) : null}
      {sheet ? (
        <HandoffChangeSheet
          key={sheet.key}
          visible
          booking={booking}
          viewer={viewer}
          initialKind="drop_off"
          allowPlace
          title={showCard ? "Suggest another" : "Change time or place"}
          submitLabel={`Send to ${other}`}
          onSend={sendChange}
          onSendPair={sendPair}
          onChanged={onChanged}
          onDone={() => {
            setSheet(null);
            toast.show(`Sent to ${other}`);
          }}
          onClose={() => setSheet(null)}
        />
      ) : null}
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    wrap: { width: "100%", alignItems: "center" },
    card: { gap: theme.spacing.xs, maxWidth: "92%", width: "92%" },
    title: { fontSize: theme.fontSize.body, fontWeight: theme.fontWeight.bold, color: theme.color.text },
    line: { fontSize: theme.fontSize.small, color: theme.color.textMuted },
    actions: { gap: theme.spacing.xs, marginTop: theme.spacing.xs },
  });
