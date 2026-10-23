import { router, useFocusEffect } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";

import { BookingCard } from "../../../components/BookingCard";
import { EmptyState } from "../../../components/ui/EmptyState";
import { LoadingView } from "../../../components/ui/LoadingView";
import { Screen } from "../../../components/ui/Screen";
import { SegmentedControl } from "../../../components/ui/SegmentedControl";
import { BookingSummary, SitterBucket, firstSitterBucket, listSitterBookings, sitterBucket } from "../../../lib/bookings";
import { useSession } from "../../../providers/SessionProvider";
import { useThemedStyles } from "../../../providers/ThemeProvider";
import { useOnBookingChange } from "../../../providers/NotificationsProvider";
import { Theme } from "../../../theme/themes";

type Bucket = SitterBucket;

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
  in_progress: {
    emoji: "🐾",
    title: "No stays in progress",
    message: "Stays where the pets are with you show here until they go home.",
  },
  upcoming: {
    emoji: "📅",
    title: "No upcoming stays",
    message: "Stays you accept show here until the pets arrive.",
  },
  past: {
    emoji: "🐾",
    title: "No past stays",
    message: "Finished, declined and cancelled bookings show here.",
  },
};

/** Sitter Bookings tab (phase-03b 3B.4): Requests · In progress · Upcoming · Past → booking detail. Chats have their own tab (#329). */
export default function SitterBookings() {
  const styles = useThemedStyles(makeStyles);
  const { profile } = useSession();
  const sitterId = profile?.id;
  const [state, setState] = useState<State>({ status: "loading" });
  const [bucket, setBucket] = useState<Bucket>("requests");
  const userPicked = useRef(false);

  // `open` = choose the tab to land on (when the sitter arrives); a refresh in place never moves them.
  const load = useCallback(
    async (open = false) => {
      if (!sitterId) return;
      try {
        const bookings = await listSitterBookings(sitterId);
        setState({ status: "ready", bookings });
        // Open on what needs the sitter most: a stay on or about to start, else open requests. Never override a tab the
        // sitter picked themselves.
        if (open && !userPicked.current) setBucket(firstSitterBucket(bookings));
      } catch (error) {
        setState({ status: "error", message: (error as Error).message });
      }
    },
    [sitterId],
  );

  useOnBookingChange(() => void load());

  useFocusEffect(
    useCallback(() => {
      void load(true);
      // A tab picked by hand holds for this visit; the next visit lands on what needs the sitter again (#228).
      return () => {
        userPicked.current = false;
      };
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

  const count = (b: SitterBucket) => state.bookings.filter((x) => sitterBucket(x) === b).length;
  const shown = state.bookings.filter((b) => sitterBucket(b) === bucket);
  const requests = count("requests");
  const empty = shown.length === 0;

  return (
    <Screen contentStyle={styles.content}>
      <SegmentedControl
        options={[
          { value: "requests", label: "Requests", count: requests },
          { value: "in_progress", label: "In progress", count: count("in_progress") },
          { value: "upcoming", label: "Upcoming" },
          { value: "past", label: "Past" },
        ]}
        value={bucket}
        onChange={(next) => {
          userPicked.current = true;
          setBucket(next);
        }}
        scrollable
        testID="sitter-bookings-tabs"
      />
      {empty ? (
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
