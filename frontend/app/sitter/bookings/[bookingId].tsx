import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { bookingBadges, handoffLine } from "../../../components/BookingCard";
import { HandoffChange, HandoffChangeSheet } from "../../../components/HandoffChangeSheet";
import { MeetGreetCard } from "../../../components/MeetGreetCard";
import { ProposalCard, showsProposal } from "../../../components/ProposalCard";
import { Button } from "../../../components/ui/Button";
import { Card } from "../../../components/ui/Card";
import { Chip } from "../../../components/ui/Chip";
import { EmptyState } from "../../../components/ui/EmptyState";
import { LoadingView } from "../../../components/ui/LoadingView";
import { Screen } from "../../../components/ui/Screen";
import { Sheet } from "../../../components/ui/Sheet";
import { TextButton } from "../../../components/ui/TextButton";
import { SPECIES_EMOJI } from "../../../features/pets/petFormat";
import { formatDay, formatInstant, formatTime } from "../../../features/schedule/dates";
import { SERVICE_LABEL } from "../../../features/sitters/sitterApi";
import {
  BookingError,
  BookingSummary,
  CHECK_IN_WINDOW_MS,
  HandoffKind,
  PetCare,
  completeHandoff,
  declinedChange,
  getBooking,
  getHandoffAddresses,
  loadPetCare,
  meetGreetBlocksAccept,
  proposeHandoff,
  respondBooking,
  respondHandoff,
} from "../../../lib/bookings";
import { useThemedStyles } from "../../../providers/ThemeProvider";
import { useToast } from "../../../providers/ToastProvider";
import { Theme } from "../../../theme/themes";

const KINDS: HandoffKind[] = ["drop_off", "pick_up"];

type State =
  | { status: "loading" }
  | {
      status: "ready";
      booking: BookingSummary;
      pets: PetCare[];
      addresses: Partial<Record<HandoffKind, string>>;
    }
  | { status: "missing" }
  | { status: "error"; message: string };

const SLOT_LABEL: Record<string, string> = { morning: "Morning", afternoon: "Afternoon", overnight: "Overnight" };

/** "2026-10-05 morning, …" (sitter_unavailable detail) → "Oct 5 Morning". */
function firstSlot(detail: string | null): string | null {
  const [day, slot] = (detail ?? "").split(",")[0].trim().split(" ");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day ?? "")) return null;
  return `${formatDay(day)} ${SLOT_LABEL[slot] ?? slot ?? ""}`.trim();
}

/** Human copy for the RPC errors this screen can hit (phase-03b 3B.4–3B.5). */
function actionError(error: unknown, owner: string): string {
  if (!(error instanceof BookingError)) return (error as Error).message;
  if (error.code === "handoff_pending") return `Waiting for ${owner} to confirm the new time.`;
  if (error.code === "meet_greet_required") return `Meet ${owner} first — or agree to skip the Meet & Greet.`;
  if (error.code === "handoff_completed") return "That handoff already happened.";
  if (error.code === "sitter_unavailable") {
    const slot = firstSlot(error.detail);
    return slot ? `You no longer have room on ${slot}.` : "You no longer have room for these dates.";
  }
  return error.message;
}

/**
 * Sitter booking detail (phase-03b 3B.4–3B.5): owner, pets with allergies and care tasks,
 * the two handoffs (addresses once confirmed). A request: **Accept** / Suggest a time /
 * Decline. The owner's offers: Accept / Suggest another time / Decline. Confirmed:
 * **Change time or place**. Received / Returned land in 3B.6, Meet & Greet in 3B.9.
 */
export default function SitterBookingDetail() {
  const styles = useThemedStyles(makeStyles);
  const toast = useToast();
  const { bookingId } = useLocalSearchParams<{ bookingId: string }>();
  const [state, setState] = useState<State>({ status: "loading" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDecline, setConfirmDecline] = useState(false);
  const [sheet, setSheet] = useState<{ key: number; kind: HandoffKind; mode: "suggest" | "change" } | null>(null);

  const load = useCallback(async () => {
    if (!bookingId) return;
    try {
      const booking = await getBooking(bookingId);
      if (!booking) {
        setState({ status: "missing" });
        return;
      }
      const [pets, addresses] = await Promise.all([
        loadPetCare(booking.pets.flatMap((p) => (p.id ? [p.id] : []))),
        booking.status === "confirmed" ? getHandoffAddresses(booking.id) : Promise.resolve({}),
      ]);
      setState({ status: "ready", booking, pets, addresses });
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
        <EmptyState emoji="🔍" title="Booking not found" message="It may have been cancelled or removed." />
      </Screen>
    );
  }
  if (state.status === "error") {
    return (
      <Screen>
        <EmptyState
          emoji="📬"
          title="Couldn't load this booking"
          message={state.message}
          action={{ label: "Try again", onPress: () => void load() }}
        />
      </Screen>
    );
  }

  const { booking, pets, addresses } = state;
  const owner = booking.ownerName;
  const isRequest = booking.status === "requested";
  const meetFirst = isRequest && meetGreetBlocksAccept(booking);
  const waiting = isRequest && booking.sitterSuggested;
  const canAccept = isRequest && !meetFirst && !waiting && !busy;
  // Received opens 2 h before the agreed drop-off (complete_handoff, 003).
  const checkInFrom = booking.dropOff ? Date.parse(booking.dropOff.at) - CHECK_IN_WINDOW_MS : null;
  const petNames = booking.pets.map((p) => p.name).join(" & ") || "The pets";

  const run = async (action: () => Promise<void>, done: string, after?: () => void) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      toast.show(done);
      if (after) after();
      else await load();
    } catch (err) {
      setError(actionError(err, owner));
    } finally {
      setBusy(false);
    }
  };

  const send = (change: HandoffChange) => {
    setSheet(null);
    void run(() => proposeHandoff(booking.id, change.kind, change.at, change.place), `New time sent to ${owner}`);
  };

  const handoffNote = (kind: HandoffKind) => {
    const h = kind === "drop_off" ? booking.dropOff : booking.pickUp;
    if (!isRequest || !h || !h.pending || showsProposal(booking, "sitter", kind)) return null;
    if (h.proposedBy === booking.sitterId) return `You suggested this — waiting for ${owner}.`;
    return h.withinSitterHours ? null : "Custom time — outside your hours, needs your OK.";
  };

  return (
    <View style={styles.root}>
      <Screen contentStyle={styles.content}>
        <Card style={styles.block}>
          <Text accessibilityRole="header" style={styles.title} testID="booking-owner">
            {owner}
          </Text>
          <View style={styles.chips}>
            {bookingBadges(booking, "sitter").map((b) => (
              <Chip key={b.label} label={b.label} />
            ))}
            <Chip label={SERVICE_LABEL[booking.serviceType]} />
          </View>
        </Card>

        <MeetGreetCard booking={booking} viewer="sitter" onChanged={load} />

        {KINDS.filter((kind) => showsProposal(booking, "sitter", kind)).map((kind) => (
          <ProposalCard
            key={kind}
            booking={booking}
            viewer="sitter"
            kind={kind}
            busy={busy}
            onAccept={(id) => void run(() => respondHandoff(id, true), `New time agreed with ${owner}`)}
            onSuggest={(k) => setSheet({ key: Date.now(), kind: k, mode: "suggest" })}
            onDecline={(id) =>
              void run(
                () => respondHandoff(id, false),
                isRequest ? "Request declined" : `${owner} keeps the original time`,
                isRequest ? () => router.back() : undefined,
              )
            }
          />
        ))}

        <Card style={styles.block}>
          {KINDS.map((kind) => {
            const note = handoffNote(kind);
            const h = kind === "drop_off" ? booking.dropOff : booking.pickUp;
            return (
              <View key={kind} style={styles.handoff} testID={`handoff-${kind}`}>
                <Text style={styles.body}>
                  {handoffLine(kind === "drop_off" ? "Drop-off" : "Pick-up", h, booking, "sitter")}
                </Text>
                {addresses[kind] ? <Text style={styles.muted}>{`📍 ${addresses[kind]}`}</Text> : null}
                {note ? <Text style={styles.warning}>{note}</Text> : null}
                {declinedChange(booking, kind, booking.sitterId) ? (
                  <Text style={styles.warning} testID={`declined-${kind}`}>{`${owner} kept the original time.`}</Text>
                ) : null}
              </View>
            );
          })}
          {isRequest ? (
            <View style={styles.row}>
              <TextButton
                label="Suggest drop-off time"
                onPress={() => setSheet({ key: Date.now(), kind: "drop_off", mode: "suggest" })}
                testID="suggest-drop_off"
              />
              <TextButton
                label="Suggest pick-up time"
                onPress={() => setSheet({ key: Date.now(), kind: "pick_up", mode: "suggest" })}
                testID="suggest-pick_up"
              />
            </View>
          ) : null}
          {booking.status === "confirmed" ? (
            <TextButton
              label="Change time or place"
              onPress={() => setSheet({ key: Date.now(), kind: "pick_up", mode: "change" })}
              style={styles.left}
              testID="change-booking"
            />
          ) : null}
        </Card>

        {pets.map((pet) => (
          <Card key={pet.id} style={styles.block} testID={`pet-care-${pet.name}`}>
            <Text style={styles.label}>
              {`${SPECIES_EMOJI[pet.species]} ${pet.name}`}
              {pet.breed ? <Text style={styles.muted}>{` · ${pet.breed}`}</Text> : null}
            </Text>
            {pet.allergies.length > 0 ? (
              <View style={styles.chips}>
                <Text style={styles.warning}>Allergies</Text>
                {pet.allergies.map((a) => (
                  <Chip key={a} label={a} />
                ))}
              </View>
            ) : (
              <Text style={styles.muted}>No allergies listed</Text>
            )}
            {pet.tasks.map((t) => (
              <Text key={t.id} style={styles.body}>
                {`${formatTime(t.time)} · ${t.title}${t.dose ? ` (${t.dose})` : ""}`}
              </Text>
            ))}
            {pet.notes ? <Text style={styles.muted}>{pet.notes}</Text> : null}
          </Card>
        ))}

        {error ? (
          <Text accessibilityRole="alert" style={styles.error} testID="booking-action-error">
            {error}
          </Text>
        ) : null}
      </Screen>

      {isRequest ? (
        <View style={styles.footer}>
          {waiting ? <Text style={styles.muted}>{`Waiting for ${owner} to confirm the new time.`}</Text> : null}
          <Button
            label={busy ? "Saving…" : "Accept"}
            onPress={() => void run(() => respondBooking(booking.id, true), `Booking confirmed — ${owner} gets a notice`)}
            disabled={!canAccept}
            testID="accept-booking"
          />
          <TextButton label="Decline" danger onPress={() => setConfirmDecline(true)} testID="decline-booking" />
        </View>
      ) : null}

      {booking.status === "confirmed" ? (
        <View style={styles.footer} testID="handoff-check">
          {!booking.dropOff?.completedAt ? (
            <>
              {checkInFrom && Date.now() < checkInFrom ? (
                <Text style={styles.muted}>{`You can check in from ${formatInstant(new Date(checkInFrom).toISOString())}.`}</Text>
              ) : null}
              <Button
                label={busy ? "Saving…" : "Received"}
                onPress={() =>
                  void run(() => completeHandoff(booking.id, "drop_off"), `${petNames} checked in — ${owner} gets a notice`)
                }
                disabled={busy || !checkInFrom || Date.now() < checkInFrom}
                testID="handoff-received"
              />
            </>
          ) : !booking.pickUp?.completedAt ? (
            <Button
              label={busy ? "Saving…" : "Returned"}
              onPress={() =>
                void run(() => completeHandoff(booking.id, "pick_up"), `${petNames} on the way home — ${owner} gets a notice`)
              }
              disabled={busy}
              testID="handoff-returned"
            />
          ) : (
            <Text style={styles.muted} testID="stay-complete">
              Stay complete 🐾
            </Text>
          )}
        </View>
      ) : null}

      {sheet ? (
        <HandoffChangeSheet
          key={sheet.key}
          visible
          booking={booking}
          viewer="sitter"
          initialKind={sheet.kind}
          allowPlace={sheet.mode === "change"}
          title={sheet.mode === "change" ? "Change time or place" : "Suggest another time"}
          submitLabel={`Send to ${owner}`}
          onSubmit={send}
          onClose={() => setSheet(null)}
        />
      ) : null}

      <Sheet
        visible={confirmDecline}
        title={`Decline ${owner}'s request?`}
        onClose={() => setConfirmDecline(false)}
        testID="decline-sheet"
        footer={
          <Button
            label="Decline request"
            onPress={() => {
              setConfirmDecline(false);
              void run(() => respondBooking(booking.id, false), "Request declined", () => router.back());
            }}
            testID="decline-confirm"
          />
        }
      >
        <Text style={styles.body}>{`${owner} gets a notice and can find another sitter.`}</Text>
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
    row: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: theme.spacing.sm,
    },
    left: {
      alignSelf: "flex-start",
      paddingHorizontal: 0,
    },
    footer: {
      gap: theme.spacing.xs,
      padding: theme.spacing.md,
      maxWidth: 480,
      width: "100%",
      alignSelf: "center",
    },
  });
