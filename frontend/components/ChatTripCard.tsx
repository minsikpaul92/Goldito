import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { ChatMessage } from "../features/chat/chatApi";
import { formatDay, formatTime, isoToZoned } from "../features/schedule/dates";
import { Role, arrivedForNext, arrivedTime, canTravel, greetingFor, minutesAway, nextHandoff, startOpensAt, tripArrived } from "../features/transit/tripLogic";
import { useLiveTrips } from "../features/transit/useLiveTrips";
import { useStartTrip } from "../features/transit/useStartTrip";
import { BookingSummary, completeHandoff } from "../lib/bookings";
import { endTrip, isLive } from "../lib/transit";
import { useErrorDialog } from "../providers/ErrorDialogProvider";
import { useSession } from "../providers/SessionProvider";
import { useToast } from "../providers/ToastProvider";
import { useThemedStyles } from "../providers/ThemeProvider";
import { Theme } from "../theme/themes";
import { Button } from "./ui/Button";
import { Card } from "./ui/Card";

type Props = {
  booking: BookingSummary;
  viewer: Role;
  messages: ChatMessage[];
  /** Something changed (Received, I've arrived): the chat reloads. */
  onSent: () => void;
  /** The hello this person may send now, or null: the chat shows it as a quick reply above the box. */
  onGreeting?: (greeting: string | null) => void;
  /** The + menu's Start trip: starts it (or opens the running trip) each time this number goes up. */
  startSignal?: number;
};

/**
 * The trip, in the chat (3D.8): Start trip for the person who travels, then "on the way", "N min away" and "arrived"
 * for both, and a one-tap hello once they are there. It reads the booking's trips like the booking page does and
 * opens the same Trip screen; nothing is stored in the chat.
 *
 * #250: the sitter's Received for the drop-off lives on this card and shows only once the trip got there (arrived on the
 * way, or ended with "I've arrived"), never just because the 2-hour window opened. The hello is a quick reply in the
 * chip row above the box, not on this card: the owner's first, the sitter's answer only after the owner's is in the chat.
 */
export function ChatTripCard({ booking, viewer, messages, onSent, onGreeting, startSignal = 0 }: Props) {
  const styles = useThemedStyles(makeStyles);
  const { profile } = useSession();
  const errorDialog = useErrorDialog();
  const toast = useToast();
  const enabled = booking.status === "confirmed" && !!booking.paidAt;
  const { trips } = useLiveTrips(booking.id, enabled);
  const start = useStartTrip(booking, viewer);
  const [, tick] = useState(0);
  const [sending, setSending] = useState(false);
  const live = trips?.find(isLive);
  // The hello worked out below is handed to the chat after each render, only when it changes.
  const pendingGreeting = useRef<string | null>(null);
  const reportedGreeting = useRef<string | null>(null);
  pendingGreeting.current = null;
  useEffect(() => {
    if (pendingGreeting.current === reportedGreeting.current) return;
    reportedGreeting.current = pendingGreeting.current;
    onGreeting?.(pendingGreeting.current);
  });

  // The "N min away" line follows the clock between the position updates.
  useEffect(() => {
    if (!live) return;
    const timer = setInterval(() => tick((n) => n + 1), 15_000);
    return () => clearInterval(timer);
  }, [live]);

  // What the + menu asks for: set below, once the trip's state is known.
  const onStart = useRef<() => void>(() => undefined);
  useEffect(() => {
    if (startSignal > 0) onStart.current();
  }, [startSignal]);

  if (!enabled || trips === null) return null;

  const tripHref = `/${viewer}/bookings/${booking.id}/trip` as const;
  const nameOf = (id: string) => (id === booking.ownerId ? booking.ownerName : booking.sitterName);

  // The newest trip that got there, live or done: the hello and Received belong to it.
  const arrivedTrip = trips.find(tripArrived);
  const greeting = arrivedTrip ? greetingFor(arrivedTrip.handoff_kind, viewer) : null;
  const arrivedAt = arrivedTrip ? arrivedTime(arrivedTrip) : "";
  const said = (text: string | null, by: string | undefined) =>
    !!text && messages.some((m) => m.kind === "text" && m.senderId === by && m.body === text && Date.parse(m.at) >= Date.parse(arrivedAt));
  const greeted = said(greeting, profile?.id);
  // The sitter answers the owner's hello: their quick reply waits for it.
  const ownerSpoke = !!arrivedTrip && said(greetingFor(arrivedTrip.handoff_kind, "owner"), booking.ownerId);
  const mayGreet = !!greeting && !greeted && (viewer === "owner" || ownerSpoke);
  pendingGreeting.current = mayGreet ? greeting : null;
  // Received is the sitter's, for the drop-off, once that trip got there and only until it is done.
  const receivable =
    viewer === "sitter" && arrivedTrip?.handoff_kind === "drop_off" && !booking.dropOff?.completedAt;
  onStart.current = () => {
    if (live) {
      router.push(tripHref);
      return;
    }
    if (arrivedForNext(booking, trips)) return; // they are there already: no second trip
    const upcoming = nextHandoff(booking);
    if (!upcoming || !canTravel(viewer, upcoming.handoff.locationType) || Date.now() < startOpensAt(upcoming.handoff)) return;
    void start(upcoming.kind).then((result) => {
      if (result.started) router.push(tripHref);
    });
  };
  // At the sitter's door the card also carries Received: one card says they have arrived and lets the sitter take the pets.
  const receive = async () => {
    setSending(true);
    try {
      await completeHandoff(booking.id, "drop_off");
      toast.show(`${booking.pets.map((p) => p.name).join(" & ") || "The pets"} checked in. ${booking.ownerName} gets a notice`);
      onSent();
    } catch (e) {
      errorDialog.show({ title: "Not saved", message: (e as Error).message });
    } finally {
      setSending(false);
    }
  };
  // "I've arrived" (#250): a trip without a live position never arrives by distance, so the traveller says so.
  const arrive = async (tripId: string) => {
    setSending(true);
    try {
      await endTrip(tripId);
      onSent();
    } catch (e) {
      errorDialog.show({ title: "Not saved", message: (e as Error).message });
    } finally {
      setSending(false);
    }
  };
  const receiveButton = receivable ? (
    <Button label="Received" onPress={() => void receive()} disabled={sending} testID="chat-received" />
  ) : null;

  if (live) {
    const mine = live.traveler_id === profile?.id;
    const traveler = nameOf(live.traveler_id);
    const mins = live.status === "en_route" && live.sharing ? minutesAway(live.eta_at, Date.now()) : null;
    const at = live.arrived_at ? ` · ${formatTime(isoToZoned(live.arrived_at).time)}` : "";
    const eta = live.eta_at && live.sharing ? ` · ETA ${formatTime(isoToZoned(live.eta_at).time)}` : "";
    const line =
      live.status === "arrived"
        ? mine
          ? `You've arrived 📍${at}`
          : `${traveler} has arrived 🐾${at}`
        : mins !== null
          ? mine
            ? `You're ${mins < 1 ? "almost there" : `${mins} min away`} 🐾`
            : `${traveler} is ${mins < 1 ? "almost there" : `${mins} min away`} 🐾`
          : mine
            ? `You're on the way 🐾${eta}`
            : `${traveler} is on the way 🐾${eta}`;
    return (
      <View style={styles.wrap}>
        <Card tone="blush" style={styles.card} testID="chat-trip-live">
          <Text style={styles.title}>{line}</Text>
          <Button
            label={mine ? "Open trip" : `Track ${traveler}`}
            variant={receivable ? "secondary" : "primary"}
            onPress={() => router.push(tripHref)}
            testID="chat-trip-open"
          />
          {mine && live.status === "en_route" ? (
            <Button label="I've arrived" variant="secondary" onPress={() => void arrive(live.id)} disabled={sending} testID="chat-trip-arrive" />
          ) : null}
          {live.status === "arrived" ? receiveButton : null}
        </Card>
      </View>
    );
  }

  const next = nextHandoff(booking);
  const canStart = !!next && canTravel(viewer, next.handoff.locationType);
  // The trip for the handoff that is still open got there: say so instead of offering Start trip again.
  const there = !!arrivedTrip && next?.kind === arrivedTrip.handoff_kind;
  // The other person makes this trip (Figma "Pick-up day"): say who, what and when, and that the owner can watch it live.
  if (!mayGreet && !receivable && !there && !canStart) {
    if (!next) return null;
    const driver = canTravel("owner", next.handoff.locationType) && !canTravel("sitter", next.handoff.locationType) ? booking.ownerName : booking.sitterName;
    const petNames = booking.pets.map((p) => p.name).filter(Boolean);
    const pets = petNames.length > 1 ? `${petNames.slice(0, -1).join(", ")} and ${petNames[petNames.length - 1]}` : (petNames[0] ?? "the pets");
    const when = isoToZoned(next.handoff.at);
    const verb = next.kind === "drop_off" ? `drops ${pets} off` : `picks ${pets} up`;
    return (
      <View style={styles.wrap}>
        <Card tone="blush" style={styles.card} testID="chat-trip-upcoming">
          <Text style={styles.oneLine}>{`${driver} ${verb} on ${formatDay(when.day)} at ${formatTime(when.time)}.${viewer === "owner" ? " You'll watch the trip live." : ""}`}</Text>
        </Card>
      </View>
    );
  }
  const opens = next ? startOpensAt(next.handoff) : 0;
  const arrivedClock = arrivedAt ? ` · ${formatTime(isoToZoned(arrivedAt).time)}` : "";
  return (
    <View style={styles.wrap}>
      {mayGreet || receivable || there ? (
        <Card tone="blush" style={styles.card} testID="chat-trip-arrived">
          <Text style={styles.title}>
            {arrivedTrip?.traveler_id === profile?.id
              ? `You've arrived${arrivedClock}`
              : `${nameOf(arrivedTrip?.traveler_id ?? "")} arrived${arrivedClock}`}
          </Text>
          {receiveButton}
        </Card>
      ) : null}
      {there ? null : next && canStart && Date.now() < opens ? (
        <Card tone="blush" style={styles.card} testID="chat-trip-waiting">
          <Text style={styles.oneLine}>{`You can start the trip from ${formatTime(isoToZoned(new Date(opens).toISOString()).time)}.`}</Text>
        </Card>
      ) : next && canStart ? (
        <Card tone="blush" style={styles.card} testID="chat-trip-start">
          <Text style={styles.title}>{next.kind === "drop_off" ? "Heading to the drop-off?" : "Heading to the pick-up?"}</Text>
          <Button
            label="Start trip"
            onPress={() => {
              void start(next.kind).then((result) => {
                if (result.started) router.push(tripHref);
              });
            }}
            testID="chat-trip-start-button"
          />
        </Card>
      ) : null}
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    wrap: { width: "100%", alignItems: "center", gap: theme.spacing.sm },
    card: { gap: theme.spacing.sm, maxWidth: "92%", width: "92%" },
    title: { fontSize: theme.fontSize.body, fontWeight: theme.fontWeight.bold, color: theme.color.text, textAlign: "center" },
    muted: { fontSize: theme.fontSize.small, color: theme.color.textMuted, textAlign: "center" },
    // The one-line system message: same size and color as "Booked, you both agreed".
    oneLine: { fontSize: theme.fontSize.body, color: theme.color.text, textAlign: "center" },
  });
