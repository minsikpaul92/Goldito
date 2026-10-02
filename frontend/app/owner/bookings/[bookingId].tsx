import { useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { bookingBadges, handoffLine } from "../../../components/BookingCard";
import { HandoffChange, HandoffChangeSheet } from "../../../components/HandoffChangeSheet";
import { ProposalCard, showsProposal } from "../../../components/ProposalCard";
import { Button } from "../../../components/ui/Button";
import { Card } from "../../../components/ui/Card";
import { Chip } from "../../../components/ui/Chip";
import { EmptyState } from "../../../components/ui/EmptyState";
import { LoadingView } from "../../../components/ui/LoadingView";
import { Screen } from "../../../components/ui/Screen";
import { Sheet } from "../../../components/ui/Sheet";
import { SPECIES_EMOJI } from "../../../features/pets/petFormat";
import { SERVICE_LABEL } from "../../../features/sitters/sitterApi";
import {
  BookingError,
  BookingSummary,
  HandoffKind,
  declinedChange,
  getBooking,
  getHandoffAddresses,
  proposeHandoff,
  respondHandoff,
} from "../../../lib/bookings";
import { useThemedStyles } from "../../../providers/ThemeProvider";
import { useToast } from "../../../providers/ToastProvider";
import { Theme } from "../../../theme/themes";

type State =
  | { status: "loading" }
  | { status: "ready"; booking: BookingSummary; addresses: Partial<Record<HandoffKind, string>> }
  | { status: "missing" }
  | { status: "error"; message: string };

const KINDS: HandoffKind[] = ["drop_off", "pick_up"];

function actionError(error: unknown, sitter: string): string {
  if (!(error instanceof BookingError)) return (error as Error).message;
  if (error.code === "sitter_unavailable") return `${sitter} no longer has room for that time. Try another one.`;
  if (error.code === "handoff_completed") return "That handoff already happened.";
  return error.message;
}

/**
 * Owner booking detail (phase-03b 3B.5): pets, the two handoffs (addresses once
 * confirmed), the sitter's offers to Accept / Suggest another time / Decline, and
 * **Change time or place** after confirm. Cancel + Find a new sitter land in 3B.7.
 */
export default function OwnerBookingDetail() {
  const styles = useThemedStyles(makeStyles);
  const toast = useToast();
  const { bookingId } = useLocalSearchParams<{ bookingId: string }>();
  const [state, setState] = useState<State>({ status: "loading" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sheet, setSheet] = useState<{ key: number; kind: HandoffKind; mode: "suggest" | "change" } | null>(null);
  const [confirmEnd, setConfirmEnd] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!bookingId) return;
    try {
      const booking = await getBooking(bookingId);
      if (!booking) {
        setState({ status: "missing" });
        return;
      }
      const addresses = booking.status === "confirmed" ? await getHandoffAddresses(booking.id) : {};
      setState({ status: "ready", booking, addresses });
    } catch (err) {
      setState({ status: "error", message: (err as Error).message });
    }
  }, [bookingId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (state.status === "loading") return <LoadingView />;
  if (state.status === "missing") {
    return (
      <Screen>
        <EmptyState emoji="🔍" title="Booking not found" message="It may have been removed." />
      </Screen>
    );
  }
  if (state.status === "error") {
    return (
      <Screen>
        <EmptyState
          emoji="📅"
          title="Couldn't load this booking"
          message={state.message}
          action={{ label: "Try again", onPress: () => void load() }}
        />
      </Screen>
    );
  }

  const { booking, addresses } = state;
  const sitter = booking.sitterName;
  const open = booking.status === "requested" || booking.status === "confirmed";

  const run = async (action: () => Promise<void>, done: string) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      toast.show(done);
      await load();
    } catch (err) {
      setError(actionError(err, sitter));
    } finally {
      setBusy(false);
    }
  };

  const decline = (handoffId: string) => {
    // Before confirm, declining the sitter's time ends the request (respond_handoff, 003).
    if (booking.status === "requested") setConfirmEnd(handoffId);
    else void run(() => respondHandoff(handoffId, false), `${sitter} keeps the original time`);
  };

  const send = (change: HandoffChange) => {
    setSheet(null);
    void run(
      () => proposeHandoff(booking.id, change.kind, change.at, change.place),
      `Sent to ${sitter}`,
    );
  };

  return (
    <View style={styles.root}>
      <Screen contentStyle={styles.content}>
        <Card style={styles.block}>
          <Text accessibilityRole="header" style={styles.title} testID="booking-sitter">
            {sitter}
          </Text>
          <View style={styles.chips}>
            {bookingBadges(booking, "owner").map((b) => (
              <Chip key={b.label} label={b.label} />
            ))}
            <Chip label={SERVICE_LABEL[booking.serviceType]} />
          </View>
          <Text style={styles.body}>{booking.pets.map((p) => `${SPECIES_EMOJI[p.species]} ${p.name}`).join("  ")}</Text>
        </Card>

        {KINDS.filter((kind) => showsProposal(booking, "owner", kind)).map((kind) => (
          <ProposalCard
            key={kind}
            booking={booking}
            viewer="owner"
            kind={kind}
            busy={busy}
            onAccept={(id) => void run(() => respondHandoff(id, true), `New time agreed with ${sitter}`)}
            onSuggest={(k) => setSheet({ key: Date.now(), kind: k, mode: "suggest" })}
            onDecline={decline}
          />
        ))}

        <Card style={styles.block}>
          {KINDS.map((kind) => {
            const h = kind === "drop_off" ? booking.dropOff : booking.pickUp;
            return (
              <View key={kind} style={styles.handoff} testID={`handoff-${kind}`}>
                <Text style={styles.body}>
                  {handoffLine(kind === "drop_off" ? "Drop-off" : "Pick-up", h, booking, "owner")}
                </Text>
                {addresses[kind] ? <Text style={styles.muted}>{`📍 ${addresses[kind]}`}</Text> : null}
                {declinedChange(booking, kind, booking.ownerId) ? (
                  <Text style={styles.warning} testID={`declined-${kind}`}>{`${sitter} kept the original time.`}</Text>
                ) : null}
              </View>
            );
          })}
          {booking.status === "requested" && !booking.sitterSuggested ? (
            <Text style={styles.muted}>{`Waiting for ${sitter} to answer your request.`}</Text>
          ) : null}
        </Card>

        {error ? (
          <Text accessibilityRole="alert" style={styles.error} testID="booking-action-error">
            {error}
          </Text>
        ) : null}
      </Screen>

      {booking.status === "confirmed" ? (
        <View style={styles.footer}>
          <Button
            label="Change time or place"
            onPress={() => setSheet({ key: Date.now(), kind: "pick_up", mode: "change" })}
            disabled={busy || !open}
            testID="change-booking"
          />
        </View>
      ) : null}

      {sheet ? (
        <HandoffChangeSheet
          key={sheet.key}
          visible
          booking={booking}
          viewer="owner"
          initialKind={sheet.kind}
          allowPlace={sheet.mode === "change"}
          title={sheet.mode === "change" ? "Change time or place" : "Suggest another time"}
          submitLabel={`Send to ${sitter}`}
          onSubmit={send}
          onClose={() => setSheet(null)}
        />
      ) : null}

      <Sheet
        visible={!!confirmEnd}
        title="Decline this time?"
        onClose={() => setConfirmEnd(null)}
        testID="end-request-sheet"
        footer={
          <Button
            label="Decline and end the request"
            onPress={() => {
              const id = confirmEnd;
              setConfirmEnd(null);
              if (id) void run(() => respondHandoff(id, false), "Request ended");
            }}
            testID="end-request-confirm"
          />
        }
      >
        <Text style={styles.body}>
          {`This will end the booking request. To keep it going, suggest another time to ${sitter} instead.`}
        </Text>
      </Sheet>
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: theme.color.background,
    },
    content: {
      gap: theme.spacing.md,
    },
    block: {
      gap: theme.spacing.sm,
    },
    title: {
      fontSize: theme.fontSize.title,
      fontWeight: "700",
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
    warning: {
      fontSize: theme.fontSize.small,
      fontWeight: "600",
      color: theme.color.warning,
    },
    error: {
      fontSize: theme.fontSize.small,
      color: theme.color.error,
    },
    chips: {
      flexDirection: "row",
      flexWrap: "wrap",
      alignItems: "center",
      gap: theme.spacing.xs,
    },
    handoff: {
      gap: 2,
    },
    footer: {
      padding: theme.spacing.md,
      maxWidth: 480,
      width: "100%",
      alignSelf: "center",
    },
  });
