import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text } from "react-native";

import { formatTime, isoToZoned } from "../features/schedule/dates";
import { Role } from "../features/transit/tripLogic";
import { useLiveTrips } from "../features/transit/useLiveTrips";
import { loadNames } from "../lib/transit";
import { useSession } from "../providers/SessionProvider";
import { useThemedStyles } from "../providers/ThemeProvider";
import { Theme } from "../theme/themes";
import { Card } from "./ui/Card";

/** Home: a trip that is running right now ("Chloe is on the way · ETA 7:42 AM"), gone as soon as it ends. */
export function ActiveTripCard({ role }: { role: Role }) {
  const styles = useThemedStyles(makeStyles);
  const { profile } = useSession();
  const { trips } = useLiveTrips();
  const [names, setNames] = useState<Record<string, string>>({});
  const ids = [...new Set((trips ?? []).map((t) => t.traveler_id))].sort().join(",");

  useEffect(() => {
    if (ids) void loadNames(ids.split(",")).then(setNames);
  }, [ids]);

  if (!trips || trips.length === 0) return null;
  return (
    <>
      {trips.map((trip) => {
        const mine = trip.traveler_id === profile?.id;
        const name = names[trip.traveler_id] ?? "Your contact";
        const eta = trip.eta_at ? ` · ETA ${formatTime(isoToZoned(trip.eta_at).time)}` : "";
        const line = mine
          ? trip.status === "arrived"
            ? "You've arrived 📍"
            : `You're on the way 🚗${eta}`
          : trip.status === "arrived"
            ? `${name} has arrived 🚗`
            : `${name} is on the way 🚗${eta}`;
        return (
          <Pressable
            key={trip.id}
            accessibilityRole="button"
            onPress={() => router.push(`/${role}/bookings/${trip.booking_id}/trip`)}
            testID="active-trip-card"
          >
            <Card style={styles.card}>
              <Text style={styles.title}>{line}</Text>
              <Text style={styles.muted}>{mine ? "Tap to open your trip" : `Tap to follow ${name}`}</Text>
            </Card>
          </Pressable>
        );
      })}
    </>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    card: { gap: theme.spacing.xs, backgroundColor: theme.color.accent },
    title: { fontSize: theme.fontSize.body, fontWeight: "700", color: theme.color.text },
    muted: { fontSize: theme.fontSize.small, color: theme.color.textMuted },
  });
