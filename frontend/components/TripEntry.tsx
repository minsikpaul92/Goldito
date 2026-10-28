import { router } from "expo-router";
import { StyleSheet, Text } from "react-native";

import { formatTime, isoToZoned } from "../features/schedule/dates";
import { Role, canTravel, nextHandoff, placeFor, startOpensAt } from "../features/transit/tripLogic";
import { useLiveTrips } from "../features/transit/useLiveTrips";
import { useStartTrip } from "../features/transit/useStartTrip";
import type { BookingSummary, HandoffKind } from "../lib/bookings";
import { isLive } from "../lib/transit";
import { useSession } from "../providers/SessionProvider";
import { useThemedStyles } from "../providers/ThemeProvider";
import { Theme } from "../theme/themes";
import { OpenInMapsButton } from "./OpenInMapsButton";
import { Button } from "./ui/Button";
import { Card } from "./ui/Card";

/**
 * The booking page's way into a trip: **Start trip** for the person who travels (from 2 hours before), and
 * **Track {name}** / **Open trip** while one is running (phase-06b 6B.3).
 */
export function TripEntry({
  booking,
  role,
  addresses,
}: {
  booking: BookingSummary;
  role: Role;
  /** The handoff places the person can already see (after payment) — what Open in Google Maps opens. */
  addresses?: Partial<Record<HandoffKind, string>>;
}) {
  const styles = useThemedStyles(makeStyles);
  const { profile } = useSession();
  const { trips } = useLiveTrips(booking.id, booking.status === "confirmed");
  const start = useStartTrip(booking, role);
  const live = trips?.find(isLive);
  const tripHref = `/${role}/bookings/${booking.id}/trip` as const;

  if (booking.status !== "confirmed" || trips === null) return null;

  if (live) {
    const mine = live.traveler_id === profile?.id;
    const traveler = live.traveler_id === booking.ownerId ? booking.ownerName : booking.sitterName;
    const eta = live.eta_at ? ` · ETA ${formatTime(isoToZoned(live.eta_at).time)}` : "";
    const line = mine
      ? live.status === "arrived"
        ? "You've arrived 📍"
        : `You're on the way 🐾${eta}`
      : live.status === "arrived"
        ? `${traveler} has arrived 🐾`
        : `${traveler} is on the way 🐾${eta}`;
    return (
      <Card style={styles.card} testID="trip-entry-live">
        <Text style={styles.title}>{line}</Text>
        <Button
          label={mine ? "Open trip" : `Track ${traveler}`}
          onPress={() => router.push(tripHref)}
          testID="trip-track"
        />
        <OpenInMapsButton
          place={placeFor(live.handoff_kind === "drop_off" ? booking.dropOff : booking.pickUp, addresses?.[live.handoff_kind], null)}
          travelling={mine}
          style="link"
          testID="trip-entry-maps"
        />
      </Card>
    );
  }

  const next = nextHandoff(booking);
  if (!booking.paidAt || !next || !canTravel(role, next.handoff.locationType)) return null;
  const opens = startOpensAt(next.handoff);
  if (Date.now() < opens) {
    return (
      <Card style={styles.card} testID="trip-entry-waiting">
        <Text style={styles.muted}>{`You can start the trip from ${formatTime(isoToZoned(new Date(opens).toISOString()).time)}.`}</Text>
      </Card>
    );
  }
  return (
    <Card style={styles.card} testID="trip-entry-start">
      <Text style={styles.title}>{next.kind === "drop_off" ? "Heading to the drop-off?" : "Heading to the pick-up?"}</Text>
      <Text style={styles.muted}>{`${role === "owner" ? booking.sitterName : booking.ownerName} can follow you on a map until you arrive.`}</Text>
      <Button
        label="Start trip"
        onPress={() => {
          void start(next.kind).then((result) => {
            if (result.started) router.push(tripHref);
          });
        }}
        testID="trip-start"
      />
      <OpenInMapsButton place={placeFor(next.handoff, addresses?.[next.kind], null)} travelling style="link" testID="trip-entry-maps" />
    </Card>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    card: { gap: theme.spacing.sm },
    title: { fontSize: theme.fontSize.body, fontWeight: theme.fontWeight.bold, color: theme.color.text },
    muted: { fontSize: theme.fontSize.small, color: theme.color.textMuted },
  });
