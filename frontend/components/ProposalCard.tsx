import { StyleSheet, Text, View } from "react-native";

import { Viewer, placeLabel } from "./BookingCard";
import { Button } from "./ui/Button";
import { Card } from "./ui/Card";
import { TextButton } from "./ui/TextButton";
import { formatInstant } from "../features/schedule/dates";
import { BookingSummary, HandoffKind, historyLine } from "../lib/bookings";
import { useThemedStyles } from "../providers/ThemeProvider";
import { Theme } from "../theme/themes";

const KIND_LABEL: Record<HandoffKind, string> = { drop_off: "drop-off", pick_up: "pick-up" };

/**
 * Whether a handoff has an open offer this card should show. A sitter answers the owner's
 * original request with Accept booking, so only the owner's counter-offers show here.
 */
export function showsProposal(b: BookingSummary, viewer: Viewer, kind: HandoffKind): boolean {
  const open = b.pending[kind];
  if (!open) return false;
  if (b.status === "confirmed") return true;
  if (viewer === "owner") return open.proposedBy === b.sitterId;
  return open.proposedBy === b.ownerId && b.history[kind].length > 1;
}

type Props = {
  booking: BookingSummary;
  viewer: Viewer;
  kind: HandoffKind;
  busy: boolean;
  onAccept: (handoffId: string) => void;
  onSuggest: (kind: HandoffKind) => void;
  onDecline: (handoffId: string) => void;
};

/**
 * One open time / place offer (DESIGN.md ProposalCard): the other side's offer with
 * Accept / Suggest another time / Decline, or my own with "Change pending" (phase-03b 3B.5).
 */
export function ProposalCard({ booking, viewer, kind, busy, onAccept, onSuggest, onDecline }: Props) {
  const styles = useThemedStyles(makeStyles);
  const open = booking.pending[kind];
  if (!open) return null;

  const me = viewer === "owner" ? booking.ownerId : booking.sitterId;
  const other = viewer === "owner" ? booking.sitterName : booking.ownerName;
  const mine = open.proposedBy === me;
  const where = placeLabel(open.locationType, open.note, booking, viewer);
  const when = `${formatInstant(open.at)} · ${where}`;
  const agreed = kind === "drop_off" ? booking.dropOff : booking.pickUp;
  const history = historyLine(booking, kind, me, formatInstant);

  return (
    <Card style={styles.card} testID={`proposal-${kind}`}>
      {mine ? (
        <>
          <Text style={styles.title}>{booking.status === "confirmed" ? "Change pending" : `Waiting for ${other}`}</Text>
          <Text style={styles.body}>{`You suggested ${KIND_LABEL[kind]} ${when}.`}</Text>
          {booking.status === "confirmed" && agreed && !agreed.pending ? (
            <Text style={styles.muted}>{`Until ${other} agrees, it stays at ${formatInstant(agreed.at)}.`}</Text>
          ) : null}
        </>
      ) : (
        <>
          <Text style={styles.title}>{`${other} suggested a new ${KIND_LABEL[kind]}`}</Text>
          <Text style={styles.body}>{when}</Text>
        </>
      )}
      {history ? <Text style={styles.muted}>{history}</Text> : null}
      {!mine ? (
        <View style={styles.actions}>
          <Button label="Accept" onPress={() => onAccept(open.id)} disabled={busy} testID={`proposal-${kind}-accept`} />
          <View style={styles.links}>
            <TextButton label="Suggest another time" onPress={() => onSuggest(kind)} testID={`proposal-${kind}-suggest`} />
            <TextButton label="Decline" danger onPress={() => onDecline(open.id)} testID={`proposal-${kind}-decline`} />
          </View>
        </View>
      ) : null}
    </Card>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    card: {
      gap: theme.spacing.xs,
      borderColor: theme.color.warning,
    },
    title: {
      fontSize: theme.fontSize.body,
      fontWeight: "600",
      color: theme.color.text,
    },
    body: {
      fontSize: theme.fontSize.body,
      color: theme.color.text,
    },
    muted: {
      fontSize: theme.fontSize.small,
      color: theme.color.textMuted,
    },
    actions: {
      gap: theme.spacing.xs,
      marginTop: theme.spacing.sm,
    },
    links: {
      flexDirection: "row",
      flexWrap: "wrap",
      justifyContent: "space-between",
    },
  });
