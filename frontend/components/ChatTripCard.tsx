import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { ChatMessage, sendChatMessage } from "../features/chat/chatApi";
import { formatTime, isoToZoned } from "../features/schedule/dates";
import { Role, canTravel, greetingFor, minutesAway, nextHandoff, startOpensAt } from "../features/transit/tripLogic";
import { useLiveTrips } from "../features/transit/useLiveTrips";
import { useStartTrip } from "../features/transit/useStartTrip";
import { BookingSummary, completeHandoff } from "../lib/bookings";
import { isLive } from "../lib/transit";
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
  threadId: string;
  messages: ChatMessage[];
  /** A hello was sent: the chat reloads. */
  onSent: () => void;
  /** The + menu's Start trip: starts it (or opens the running trip) each time this number goes up. */
  startSignal?: number;
};

/**
 * The trip, in the chat (3D.8): Start trip for the person who travels, then "on the way", "N min away" and "arrived"
 * for both, and a one-tap hello once they are there. It reads the booking's trips like the booking page does and
 * opens the same Trip screen; nothing is stored in the chat.
 */
export function ChatTripCard({ booking, viewer, threadId, messages, onSent, startSignal = 0 }: Props) {
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

  // The newest trip that got there, live or done: the hello belongs to it.
  const arrivedTrip = trips.find((t) => !!t.arrived_at || t.status === "arrived");
  const greeting = arrivedTrip ? greetingFor(arrivedTrip.handoff_kind, viewer) : null;
  const arrivedAt = arrivedTrip?.arrived_at ?? arrivedTrip?.started_at ?? "";
  const greeted =
    !!greeting &&
    messages.some((m) => m.kind === "text" && m.senderId === profile?.id && m.body === greeting && Date.parse(m.at) >= Date.parse(arrivedAt));
  const greet = async () => {
    if (!greeting || sending) return;
    setSending(true);
    try {
      await sendChatMessage(threadId, greeting);
      onSent();
    } catch (e) {
      errorDialog.show({ title: "Not sent", message: (e as Error).message });
    } finally {
      setSending(false);
    }
  };
  onStart.current = () => {
    if (live) {
      router.push(tripHref);
      return;
    }
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
  const hello = greeting && !greeted ? <Button label={greeting} onPress={() => void greet()} disabled={sending} testID="trip-greet" /> : null;

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
          : `${traveler} has arrived 🚗${at}`
        : mins !== null
          ? mine
            ? `You're ${mins < 1 ? "almost there" : `${mins} min away`} 🚗`
            : `${traveler} is ${mins < 1 ? "almost there" : `${mins} min away`} 🚗`
          : mine
            ? `You're on the way 🚗${eta}`
            : `${traveler} is on the way 🚗${eta}`;
    return (
      <View style={styles.wrap}>
        <Card style={styles.card} testID="chat-trip-live">
          <Text style={styles.title}>{line}</Text>
          <Button label={mine ? "Open trip" : `Track ${traveler}`} onPress={() => router.push(tripHref)} testID="chat-trip-open" />
          {viewer === "sitter" && live.status === "arrived" && live.handoff_kind === "drop_off" && !booking.dropOff?.completedAt ? (
            <Button label="Received" onPress={() => void receive()} disabled={sending} testID="chat-received" />
          ) : null}
          {hello}
        </Card>
      </View>
    );
  }

  const next = nextHandoff(booking);
  const canStart = !!next && canTravel(viewer, next.handoff.locationType);
  if (!hello && !canStart) return null;
  const opens = next ? startOpensAt(next.handoff) : 0;
  return (
    <View style={styles.wrap}>
      {hello ? (
        <Card style={styles.card} testID="chat-trip-arrived">
          <Text style={styles.title}>{`${nameOf(arrivedTrip?.traveler_id ?? "")} arrived ✓`}</Text>
          {hello}
        </Card>
      ) : null}
      {next && canStart && Date.now() < opens ? (
        <Card style={styles.card} testID="chat-trip-waiting">
          <Text style={styles.muted}>{`You can start the trip from ${formatTime(isoToZoned(new Date(opens).toISOString()).time)}.`}</Text>
        </Card>
      ) : next && canStart ? (
        <Card style={styles.card} testID="chat-trip-start">
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
    title: { fontSize: theme.fontSize.body, fontWeight: theme.fontWeight.bold, color: theme.color.text },
    muted: { fontSize: theme.fontSize.small, color: theme.color.textMuted },
  });
