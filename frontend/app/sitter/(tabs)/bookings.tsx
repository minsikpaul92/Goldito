import { router, useFocusEffect } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";

import { BookingCard } from "../../../components/BookingCard";
import { EmptyState } from "../../../components/ui/EmptyState";
import { LoadingView } from "../../../components/ui/LoadingView";
import { Screen } from "../../../components/ui/Screen";
import { SegmentedControl } from "../../../components/ui/SegmentedControl";
import { BookingSummary, firstSitterBucket, listSitterBookings, sitterBucket } from "../../../lib/bookings";
import { useSession } from "../../../providers/SessionProvider";
import { useThemedStyles } from "../../../providers/ThemeProvider";
import { Theme } from "../../../theme/themes";

type Bucket = "requests" | "upcoming" | "past";

type State =
  | { status: "loading" }
  | { status: "ready"; bookings: BookingSummary[] }
  | { status: "error"; message: string };

const EMPTY: Record<Bucket, { emoji: string; title: string; message: string }> = {
  requests: {
    emoji: "📬",
    title: "No requests yet",
    message: "Booking requests from owners will show here for you to accept.",
  },
  upcoming: {
    emoji: "📅",
    title: "No upcoming stays",
    message: "Stays you accept show here until the pets go home.",
  },
  past: {
    emoji: "🐾",
    title: "No past stays",
    message: "Finished, declined and cancelled bookings show here.",
  },
};

/** Sitter Bookings tab (phase-03b 3B.4): Requests · Upcoming · Past → booking detail. */
export default function SitterBookings() {
  const styles = useThemedStyles(makeStyles);
  const { profile } = useSession();
  const sitterId = profile?.id;
  const [state, setState] = useState<State>({ status: "loading" });
  const [bucket, setBucket] = useState<Bucket>("requests");
  const picked = useRef(false);

  const load = useCallback(async () => {
    if (!sitterId) return;
    try {
      const bookings = await listSitterBookings(sitterId);
      setState({ status: "ready", bookings });
      // Open on what matters most, once: a stay that is on or about to start, else open requests (the
      // Requests count stays on its tab). Never override a tab the sitter picked themselves.
      if (!picked.current) {
        picked.current = true;
        setBucket(firstSitterBucket(bookings));
      }
    } catch (error) {
      setState({ status: "error", message: (error as Error).message });
    }
  }, [sitterId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (state.status === "loading") return <LoadingView />;

  if (state.status === "error") {
    return (
      <Screen>
        <EmptyState
          emoji="📬"
          title="Couldn't load your bookings"
          message={state.message}
          action={{ label: "Try again", onPress: () => void load() }}
        />
      </Screen>
    );
  }

  const count = (b: Bucket) => state.bookings.filter((x) => sitterBucket(x) === b).length;
  const shown = state.bookings.filter((b) => sitterBucket(b) === bucket);
  const requests = count("requests");

  return (
    <Screen contentStyle={styles.content}>
      <SegmentedControl
        options={[
          { value: "requests", label: requests > 0 ? `Requests (${requests})` : "Requests" },
          { value: "upcoming", label: "Upcoming" },
          { value: "past", label: "Past" },
        ]}
        value={bucket}
        onChange={setBucket}
        testID="sitter-bookings-tabs"
      />
      {shown.length === 0 ? (
        <EmptyState {...EMPTY[bucket]} />
      ) : (
        <View style={styles.list}>
          {shown.map((booking) => (
            <BookingCard
              key={booking.id}
              booking={booking}
              viewer="sitter"
              onPress={() => router.push(`/sitter/bookings/${booking.id}`)}
            />
          ))}
        </View>
      )}
    </Screen>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    content: {
      gap: theme.spacing.md,
    },
    list: {
      gap: theme.spacing.md,
    },
  });
