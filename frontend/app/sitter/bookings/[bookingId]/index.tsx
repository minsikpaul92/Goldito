import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { bookingBadges, handoffLine } from "../../../../components/BookingCard";
import { BookingStageBar } from "../../../../components/BookingStageBar";
import { EntryInfoCard } from "../../../../components/EntryInfoCard";
import { HandoffChange, HandoffChangeSheet } from "../../../../components/HandoffChangeSheet";
import { MeetGreetCard } from "../../../../components/MeetGreetCard";
import { ProposalCard, showsProposal } from "../../../../components/ProposalCard";
import { TripEntry } from "../../../../components/TripEntry";
import { Button } from "../../../../components/ui/Button";
import { Card } from "../../../../components/ui/Card";
import { Chip } from "../../../../components/ui/Chip";
import { ChipSuggestions } from "../../../../components/ChipSuggestions";
import { EmptyState } from "../../../../components/ui/EmptyState";
import { LoadingView } from "../../../../components/ui/LoadingView";
import { Screen } from "../../../../components/ui/Screen";
import { Sheet } from "../../../../components/ui/Sheet";
import { TextButton } from "../../../../components/ui/TextButton";
import { TextField } from "../../../../components/ui/TextField";
import { composeComment } from "../../../../features/completion/reviewPresets";
import { SPECIES_EMOJI } from "../../../../features/pets/petFormat";
import { formatDay, formatInstant, formatTime } from "../../../../features/schedule/dates";
import { SERVICE_LABEL } from "../../../../features/sitters/sitterApi";
import { releaseVideoLink } from "../../../../lib/meetGreet";
import {
  BookingError,
  BookingSummary,
  awaitingFirstYes,
  cancelBooking,
  CHECK_IN_WINDOW_MS,
  EARLY_RETURN_MS,
  expressInterest,
  HandoffKind,
  PetCare,
  completeHandoff,
  declinedChange,
  getBooking,
  getHandoffAddresses,
  loadPetCare,
  meetGreetBlocksAccept,
  proposeHandoff,
  requestExpired,
  respondBooking,
  respondHandoff,
} from "../../../../lib/bookings";
import { PetRecordFold } from "../../../../components/PetRecordFold";
import { ReceivedReview } from "../../../../components/ReceivedReview";
import { OwnerNoteCard, PastOwnerNotes } from "../../../../components/OwnerNote";
import { requestLifeRecord } from "../../../../features/completion/completionApi";
import { ReturnChecks, loadReturnChecks } from "../../../../features/completion/returnChecks";
import { useThemedStyles } from "../../../../providers/ThemeProvider";
import { useOnBookingChange } from "../../../../providers/NotificationsProvider";
import { useToast } from "../../../../providers/ToastProvider";
import { Theme } from "../../../../theme/themes";

const KINDS: HandoffKind[] = ["drop_off", "pick_up"];

/** Polite reasons for a "no" — the owner reads the ones picked, plus the optional note (FB-35). */
const DECLINE_REASONS = ["Fully booked those dates", "Can't take this pet type", "Not a good fit", "Let's talk first"];
const DECLINE_NOTE_MAX = 200;

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
  if (error.code === "interest_required") return `Say "Yes, let's meet" to ${owner} first.`;
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
  const [declineReasons, setDeclineReasons] = useState<string[]>([]);
  const [declineNote, setDeclineNote] = useState("");
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [confirmReturn, setConfirmReturn] = useState(false);
  const [returnChecks, setReturnChecks] = useState<ReturnChecks | null>(null);
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
  useOnBookingChange(() => void load());

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
  // Paid once, then an agreed change needed a new consent (009d): entry codes wait for the owner.
  const checkoutReopened = booking.status === "confirmed" && !booking.paidAt && booking.priceSnapshot != null;
  const isRequest = booking.status === "requested";
  const meetFirst = isRequest && meetGreetBlocksAccept(booking);
  const waiting = isRequest && booking.sitterSuggested;
  // Why the booking ended, from the sitter's side (the owner's reason after the Meet & Greet started, or the timeout).
  const endedLine =
    booking.status !== "cancelled"
      ? null
      : booking.cancelReason === "meet_greet_timeout"
        ? `No time to meet ${owner} was set, so this booking was cancelled.`
        : booking.cancelledBy === booking.ownerId && booking.cancelReason && booking.cancelReason !== "Owner cancelled"
          ? `${owner} passed: “${booking.cancelReason}”`
          : null;
  const firstYes = isRequest && awaitingFirstYes(booking);
  const canAccept = isRequest && !meetFirst && !waiting && !busy && !requestExpired(booking);
  // First-time pairs (D60): "Yes, let's meet" holds the dates; after the Meet & Greet the same button confirms.
  const firstTimePair = isRequest && booking.meetGreetStatus !== "not_needed";
  // Received opens 2 h before the agreed drop-off (complete_handoff, 003).
  const checkInFrom = booking.dropOff ? Date.parse(booking.dropOff.at) - CHECK_IN_WINDOW_MS : null;
  const petNames = booking.pets.map((p) => p.name).join(" & ") || "The pets";
  // Returned is allowed any time (a stay can end early). From 30 minutes before the agreed pick-up on it is the normal
  // case; earlier than that the sitter is asked "really?" and the button turns red.
  const returnsEarly = booking.pickUp != null && Date.now() < Date.parse(booking.pickUp.at) - EARLY_RETURN_MS;

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

  const closeDecline = () => {
    setConfirmDecline(false);
    setDeclineReasons([]);
    setDeclineNote("");
  };

  // The sheet sends, shows what went wrong inside itself, and stays open until everything went through (FB-5).
  const sendChange = async (change: HandoffChange) => {
    try {
      await proposeHandoff(booking.id, change.kind, change.at, change.place);
    } catch (err) {
      throw new Error(actionError(err, owner));
    }
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

        <Card style={styles.block}>
          <BookingStageBar booking={booking} viewer="sitter" />
        </Card>

        {endedLine ? (
          <Card style={styles.block} testID="booking-ended">
            <Text style={styles.label}>{endedLine}</Text>
          </Card>
        ) : null}

        <PastOwnerNotes ownerId={booking.ownerId} ownerName={owner} bookingId={booking.id} />

        <MeetGreetCard booking={booking} viewer="sitter" onChanged={load} />

        <EntryInfoCard
          bookingId={booking.id}
          visible={
            booking.status === "confirmed" &&
            (booking.serviceType === "house_sitting" ||
              booking.dropOff?.locationType === "owner_home" ||
              booking.pickUp?.locationType === "owner_home")
          }
          waitingForSignature={checkoutReopened ? owner : null}
        />

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
          {booking.status === "confirmed" && !booking.pickUp?.completedAt ? (
            <TextButton
              label="Change time or place"
              onPress={() => setSheet({ key: Date.now(), kind: "pick_up", mode: "change" })}
              style={styles.left}
              testID="change-booking"
            />
          ) : null}
        </Card>

        <TripEntry booking={booking} role="sitter" addresses={addresses} />

        {pets.map((pet) => (
          <Card key={pet.id} style={styles.block} testID={`pet-care-${pet.name}`}>
            <Text style={styles.label}>
              {`${SPECIES_EMOJI[pet.species]} ${pet.name}`}
              {pet.breed ? <Text style={styles.muted}>{` · ${pet.breed}`}</Text> : null}
            </Text>
            {pet.cautions.length > 0 ? (
              <View style={styles.headsUp} testID={`heads-up-${pet.name}`}>
                <Text style={styles.warning}>⚠️ Heads-up</Text>
                {pet.cautions.map((c) => (
                  <Text key={c} style={styles.body}>{`• ${c}`}</Text>
                ))}
              </View>
            ) : null}
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
            <PetRecordFold petId={pet.id} petName={pet.name} />
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
          {firstYes ? (
            <Button
              label={busy ? "Saving…" : "Yes, let's meet"}
              onPress={() => void run(() => expressInterest(booking.id), `Dates held — ${owner} is asked to set a time`)}
              disabled={busy || requestExpired(booking)}
              testID="interest-booking"
            />
          ) : (
            <Button
              label={busy ? "Saving…" : firstTimePair ? "Confirm booking" : "Accept"}
              onPress={() => void run(() => respondBooking(booking.id, true), `Booking confirmed — ${owner} gets a notice`)}
              disabled={!canAccept}
              testID="accept-booking"
            />
          )}
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
              onPress={() => {
                setReturnChecks(null);
                setConfirmReturn(true);
                void loadReturnChecks(booking.pets, booking.sitterId).then(setReturnChecks).catch(() => undefined);
              }}
              disabled={busy}
              testID="handoff-returned"
            />
          ) : (
            <>
              <Text style={styles.muted} testID="stay-complete">
                Stay complete 🐾
              </Text>
              <ReceivedReview bookingId={booking.id} ownerName={owner} />
              <OwnerNoteCard bookingId={booking.id} ownerName={owner} />
            </>
          )}
          {!booking.dropOff?.completedAt ? (
            <TextButton label="Cancel booking" danger onPress={() => setConfirmCancel(true)} testID="cancel-booking" />
          ) : null}
        </View>
      ) : null}

      <Sheet
        visible={confirmReturn}
        title={`Return ${petNames}?`}
        onClose={() => setConfirmReturn(false)}
        testID="return-sheet"
        footer={
          <View style={styles.returnActions}>
            <Button
              label="Return"
              variant={returnsEarly ? "danger" : "primary"}
              onPress={() => {
                setConfirmReturn(false);
                void run(async () => {
                  await completeHandoff(booking.id, "pick_up");
                  // The stay is over: write the Life Record in the background (the owner's booking page retries if this fails).
                  void requestLifeRecord(booking.id).catch(() => undefined);
                }, `${petNames} home safe — ${owner} gets a notice`);
              }}
              testID="return-confirm"
            />
            <Button label="Cancel" variant="secondary" onPress={() => setConfirmReturn(false)} testID="return-cancel" />
          </View>
        }
      >
        {returnsEarly && booking.pickUp ? (
          <Text style={styles.warning} testID="return-early-warning">
            {`It's not pick-up time yet — pick-up is ${formatInstant(booking.pickUp.at)}. Do you really want to return ${petNames} now?`}
          </Text>
        ) : null}
        <Text style={styles.body}>{`${petNames} ${booking.pets.length > 1 ? "go" : "goes"} home with ${owner}. This can't be undone, and it writes the Life Record.`}</Text>
        {returnChecks && returnChecks.tasksLeft > 0 ? (
          <Text style={styles.body} testID="return-tasks-left">
            {`• ${returnChecks.tasksLeft} care task${returnChecks.tasksLeft === 1 ? "" : "s"} still open today`}
          </Text>
        ) : null}
        {returnChecks && returnChecks.petsWithoutNote.length > 0 ? (
          <>
            <Text style={styles.body} testID="return-note-missing">
              {`• You haven't sent today's note for ${returnChecks.petsWithoutNote.join(" & ")}`}
            </Text>
            <TextButton
              label="Send today's note first"
              onPress={() => {
                setConfirmReturn(false);
                router.push("/sitter/diary");
              }}
              testID="return-send-note"
            />
          </>
        ) : null}
      </Sheet>

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
                await cancelBooking(booking.id, "Sitter cancelled");
                // A video Meet & Greet's Calendar event goes with the booking (3B.11).
                await releaseVideoLink(booking.id);
              }, "Booking cancelled");
            }}
            testID="cancel-confirm"
          />
        }
      >
        <Text style={styles.body}>{`${owner} gets a notice and can find a new sitter.`}</Text>
      </Sheet>

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
          onSend={sendChange}
          onChanged={() => void load()}
          onDone={() => {
            setSheet(null);
            toast.show(`New time sent to ${owner}`);
          }}
          onClose={() => setSheet(null)}
        />
      ) : null}

      <Sheet
        visible={confirmDecline}
        title={`Decline ${owner}'s request?`}
        onClose={closeDecline}
        testID="decline-sheet"
        footer={
          <Button
            label="Decline request"
            onPress={() => {
              const reason = composeComment(declineReasons, declineNote) || null;
              closeDecline();
              void run(
                async () => {
                  await respondBooking(booking.id, false, reason);
                  // A video Meet & Greet's Calendar event goes with the declined request (3B.11).
                  await releaseVideoLink(booking.id);
                },
                "Request declined",
                () => router.back(),
              );
            }}
            testID="decline-confirm"
          />
        }
      >
        <Text style={styles.body}>{`${owner} gets a notice and can find another sitter.`}</Text>
        <Text style={styles.muted}>Pick a reason and/or leave a short note — {owner} sees both.</Text>
        <ChipSuggestions
          chips={DECLINE_REASONS.map((r, i) => ({ id: String(i), kind: "episode", label: r, source: "custom", check: null, media_id: null }))}
          off={new Set(DECLINE_REASONS.flatMap((r, i) => (declineReasons.includes(r) ? [] : [String(i)])))}
          onToggle={(id) => {
            const r = DECLINE_REASONS[Number(id)];
            setDeclineReasons((prev) => (prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r]));
          }}
          testIDPrefix="decline-reason"
        />
        <TextField
          label="Note to the owner (optional)"
          value={declineNote}
          multiline
          numberOfLines={3}
          maxLength={DECLINE_NOTE_MAX}
          onChangeText={setDeclineNote}
          testID="decline-note"
        />
        <TextButton
          label="Suggest another time instead"
          onPress={() => {
            closeDecline();
            setSheet({ key: Date.now(), kind: "drop_off", mode: "suggest" });
          }}
          testID="decline-suggest"
        />
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
    returnActions: {
      gap: theme.spacing.sm,
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
    headsUp: {
      gap: 2,
      padding: theme.spacing.sm,
      borderRadius: theme.radius.md,
      borderWidth: 1,
      borderColor: theme.color.warning,
      backgroundColor: theme.color.accent,
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
