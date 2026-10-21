import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";

import { BookingCard } from "../../../components/BookingCard";
import { ChatList } from "../../../components/ChatList";
import { EmptyState } from "../../../components/ui/EmptyState";
import { LoadingView } from "../../../components/ui/LoadingView";
import { Screen } from "../../../components/ui/Screen";
import { SegmentedControl } from "../../../components/ui/SegmentedControl";
import { useMyChats } from "../../../features/chat/useMyChats";
import { BookingSummary, SitterBucket, firstSitterBucket, listSitterBookings, sitterBucket } from "../../../lib/bookings";
import { useSession } from "../../../providers/SessionProvider";
import { useThemedStyles } from "../../../providers/ThemeProvider";
import { useOnBookingChange } from "../../../providers/NotificationsProvider";
import { Theme } from "../../../theme/themes";

type Bucket = SitterBucket | "chats";

type State =
  | { status: "loading" }
  | { status: "ready"; bookings: BookingSummary[] }
  | { status: "error"; message: string };

const EMPTY: Record<Bucket, { emoji: string; title: string; message: string }> = {
  chats: {
    emoji: "💬",
    title: "No chats yet",
    message: "Chats with owners show here.",
  },
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

/** Sitter Bookings tab (phase-03b 3B.4): Chats · Requests · In progress · Upcoming · Past → booking detail. */
export default function SitterBookings() {
  const styles = useThemedStyles(makeStyles);
  const { profile } = useSession();
  const sitterId = profile?.id;
  const [state, setState] = useState<State>({ status: "loading" });
  const [bucket, setBucket] = useState<Bucket>("requests");
  const userPicked = useRef(false);
  const chats = useMyChats();
  // The newest chat with something new for me (#228): Bookings opens on Chats and points at it.
  const newest = chats.items.filter((c) => c.unread > 0).sort((a, b) => b.lastAt.localeCompare(a.lastAt))[0] ?? null;
  const hasUnread = useRef(false);
  hasUnread.current = newest != null;

  // `open` = choose the tab to land on (when the sitter arrives); a refresh in place never moves them.
  const load = useCallback(
    async (open = false) => {
      if (!sitterId) return;
      try {
        const bookings = await listSitterBookings(sitterId);
        setState({ status: "ready", bookings });
        // Open on what needs the sitter most: a chat with something new (#228), else a stay on or about to start,
        // else open requests. Never override a tab the sitter picked themselves.
        if (open && !userPicked.current) setBucket(hasUnread.current ? "chats" : firstSitterBucket(bookings));
      } catch (error) {
        setState({ status: "error", message: (error as Error).message });
      }
    },
    [sitterId],
  );

  useOnBookingChange(() => void load());

  // A chat that turns unread while the sitter is here (or arrives right after they land, the list loads on focus too)
  // moves them to Chats, unless they picked a tab themselves. Nothing happens inside an open chat: this is the list.
  const newestKey = newest ? `${newest.threadId}|${newest.lastAt}` : null;
  useEffect(() => {
    if (newestKey && !userPicked.current) setBucket("chats");
  }, [newestKey]);

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
  const shown = bucket === "chats" ? [] : state.bookings.filter((b) => sitterBucket(b) === bucket);
  const requests = count("requests");
  const empty = bucket === "chats" ? chats.items.length === 0 : shown.length === 0;

  return (
    <Screen contentStyle={styles.content}>
      <SegmentedControl
        options={[
          { value: "chats", label: "Chats", count: chats.unread },
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
      ) : bucket === "chats" ? (
        <ChatList items={chats.items} onLeave={(id) => void chats.leave(id)} highlightId={newest?.threadId ?? null} />
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
