import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { bookingBadges, handoffLine } from "../../../../components/BookingCard";
import { FinishedStay } from "../../../../components/FinishedStay";
import { HandoffChange, HandoffChangeSheet } from "../../../../components/HandoffChangeSheet";
import { MeetGreetCard } from "../../../../components/MeetGreetCard";
import { ProposalCard, showsProposal } from "../../../../components/ProposalCard";
import { Button } from "../../../../components/ui/Button";
import { Card } from "../../../../components/ui/Card";
import { CheckRow } from "../../../../components/ui/CheckRow";
import { Chip } from "../../../../components/ui/Chip";
import { EmptyState } from "../../../../components/ui/EmptyState";
import { LoadingView } from "../../../../components/ui/LoadingView";
import { Screen } from "../../../../components/ui/Screen";
import { Sheet } from "../../../../components/ui/Sheet";
import { TextButton } from "../../../../components/ui/TextButton";
import { SPECIES_EMOJI } from "../../../../features/pets/petFormat";
import { SERVICE_LABEL } from "../../../../features/sitters/sitterApi";
import { releaseVideoLink } from "../../../../lib/meetGreet";
import {
  BookingError,
  BookingSummary,
  cancelBooking,
  HandoffKind,
  HandoffPlace,
  declinedChange,
  getBooking,
  getHandoffDetails,
  proposeHandoff,
  respondHandoff,
} from "../../../../lib/bookings";
import { useThemedStyles } from "../../../../providers/ThemeProvider";
import { useToast } from "../../../../providers/ToastProvider";
import { Theme } from "../../../../theme/themes";

type State =
  | { status: "loading" }
  | {
      status: "ready";
      booking: BookingSummary;
      addresses: Partial<Record<HandoffKind, string>>;
      places: Partial<Record<HandoffKind, HandoffPlace>>;
      packChecks: Record<string, boolean>;
    }
  | { status: "missing" }
  | { status: "error"; message: string };

const KINDS: HandoffKind[] = ["drop_off", "pick_up"];

function actionError(error: unknown, sitter: string, pets: string): string {
  if (!(error instanceof BookingError)) return (error as Error).message;
  if (error.code === "sitter_unavailable") return `${sitter} no longer has room for that time. Try another one.`;
  if (error.code === "handoff_completed") return "That handoff already happened.";
  if (error.code === "booking_in_progress") return `${pets} is already with ${sitter} — change the pick-up time instead.`;
  return error.message;
}

/** Why a booking ended, from the owner's side. */
function endedNote(b: BookingSummary): string | null {
  if (b.status === "declined") return `${b.sitterName} can't take this one.`;
  if (b.status !== "cancelled") return null;
  if (b.cancelReason === "meet_greet_declined") return `${b.sitterName} would like to meet first, so this booking was cancelled.`;
  if (b.cancelledBy === b.sitterId) return `${b.sitterName} cancelled this booking.`;
  return "You cancelled this booking.";
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
  const [confirmCancel, setConfirmCancel] = useState(false);

  const load = useCallback(async () => {
    if (!bookingId) return;
    try {
      const booking = await getBooking(bookingId);
      if (!booking) {
        setState({ status: "missing" });
        return;
      }
      // Paid once is enough: a checkout reopened by a later change keeps the places (009e).
      const placesResult =
        booking.status === "confirmed" && (booking.paidAt || booking.priceSnapshot)
          ? await getHandoffDetails(booking.id)
          : { places: {}, error: null as string | null };
      const addresses: Partial<Record<HandoffKind, string>> = {};
      for (const kind of Object.keys(placesResult.places) as HandoffKind[]) {
        const addr = placesResult.places[kind]?.address;
        if (addr) addresses[kind] = addr;
      }
      setState((prev) => ({
        status: "ready",
        booking,
        addresses,
        places: placesResult.places,
        packChecks: prev.status === "ready" ? prev.packChecks : {},
      }));
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

  const { booking, addresses, places, packChecks } = state;
  const sitter = booking.sitterName;
  const open = booking.status === "requested" || booking.status === "confirmed";
  const petNames = booking.pets.map((p) => p.name).join(" & ") || "Your pet";
  // Cancel only before the pets are handed over (cancel_booking, 003).
  const canCancel = open && !booking.dropOff?.completedAt;
  const ended = endedNote(booking);
  const needsCheckout = booking.status === "confirmed" && !booking.paidAt;
  // Paid once, then an agreed change needed a new consent (009d).
  const checkoutReopened = needsCheckout && booking.priceSnapshot != null;
  const placeNotes =
    Object.values(places).find((p) => p && (p.visitorParking || p.lobbyNotes || p.packingList?.length)) ?? null;
  const packing = placeNotes?.packingList ?? [];
  // Address may be on a different handoff than the place-notes row.
  const sitterAddress =
    placeNotes?.address ??
    Object.values(places).find((p) => p?.address)?.address ??
    null;

  const run = async (action: () => Promise<void>, done: string) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      toast.show(done);
      await load();
    } catch (err) {
      setError(actionError(err, sitter, petNames));
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

        {booking.status === "confirmed" && booking.pickUp?.completedAt ? <FinishedStay booking={booking} /> : null}

        {ended ? (
          <Card style={styles.block} testID="booking-ended">
            <Text style={styles.label}>{ended}</Text>
            <Text style={styles.muted}>Same pets, times and places — pick another sitter.</Text>
          </Card>
        ) : null}

        {needsCheckout ? (
          <Card style={styles.block} testID="checkout-banner">
            <Text style={styles.label}>
              {checkoutReopened ? "Your stay changed — sign to finish →" : `${sitter} accepted! Finish booking →`}
            </Text>
            <Text style={styles.muted}>
              {checkoutReopened
                ? `The new plan needs one more consent. Entry info stays locked for ${sitter} until you sign.`
                : "Review the quote, sign the consents, and pay (demo — no card)."}
            </Text>
            <Button
              label="Finish booking"
              onPress={() => router.push(`/owner/bookings/${booking.id}/checkout`)}
              testID="open-checkout"
            />
          </Card>
        ) : null}

        {booking.paidAt ? <Chip label="Paid" /> : null}

        {sitterAddress || placeNotes?.visitorParking || placeNotes?.lobbyNotes ? (
          <Card style={styles.block} testID="sitter-place-card">
            <Text style={styles.label}>{`${sitter}'s place`}</Text>
            {sitterAddress ? <Text style={styles.body}>{`📍 ${sitterAddress}`}</Text> : null}
            {placeNotes?.visitorParking ? (
              <Text style={styles.muted}>{`Parking: ${placeNotes.visitorParking}`}</Text>
            ) : null}
            {placeNotes?.lobbyNotes ? <Text style={styles.muted}>{placeNotes.lobbyNotes}</Text> : null}
          </Card>
        ) : null}

        {packing.length > 0 ? (
          <Card style={styles.block} testID="packing-list">
            <Text style={styles.label}>{`Pack for ${petNames}`}</Text>
            <Text style={styles.muted}>Local checklist — not saved.</Text>
            {packing.map((item) => (
              <CheckRow
                key={item}
                label={item}
                checked={Boolean(packChecks[item])}
                onChange={(v) =>
                  setState((s) =>
                    s.status === "ready"
                      ? { ...s, packChecks: { ...s.packChecks, [item]: v } }
                      : s,
                  )
                }
                testID={`pack-${item}`}
              />
            ))}
          </Card>
        ) : null}

        <MeetGreetCard booking={booking} viewer="owner" onChanged={load} />

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

      {booking.status === "confirmed" || canCancel || ended ? (
        <View style={styles.footer}>
          {ended ? (
            <Button
              label="Find a new sitter"
              onPress={() => router.push(`/owner/bookings/new?rebook=${booking.id}`)}
              testID="find-new-sitter"
            />
          ) : null}
          {booking.status === "confirmed" ? (
            <Button
              label="Change time or place"
              onPress={() => setSheet({ key: Date.now(), kind: "pick_up", mode: "change" })}
              disabled={busy || !open}
              testID="change-booking"
            />
          ) : null}
          {canCancel ? (
            <TextButton label="Cancel booking" danger onPress={() => setConfirmCancel(true)} testID="cancel-booking" />
          ) : null}
        </View>
      ) : null}

      <Sheet
        visible={confirmCancel}
        title="Cancel this booking?"
        onClose={() => setConfirmCancel(false)}
        testID="cancel-sheet"
        footer={
          <Button
            label="Cancel booking"
            onPress={() => {
              setConfirmCancel(false);
              void run(async () => {
                await cancelBooking(booking.id, "Owner cancelled");
                // A video Meet & Greet's Calendar event goes with the booking (3B.11).
                await releaseVideoLink(booking.id);
              }, "Booking cancelled");
            }}
            testID="cancel-confirm"
          />
        }
      >
        <Text style={styles.body}>{`${sitter} gets a notice. You can book again any time.`}</Text>
      </Sheet>

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
    label: {
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
      gap: theme.spacing.xs,
      padding: theme.spacing.md,
      maxWidth: 480,
      width: "100%",
      alignSelf: "center",
    },
  });
