import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { BookingCard } from "../../../components/BookingCard";
import { SitterCard } from "../../../components/SitterCard";
import { Button } from "../../../components/ui/Button";
import { EmptyState } from "../../../components/ui/EmptyState";
import { LoadingView } from "../../../components/ui/LoadingView";
import { Screen } from "../../../components/ui/Screen";
import { MySitter, listMySitters } from "../../../features/sitters/sitterApi";
import { OwnerBooking, listOwnerBookings } from "../../../lib/bookings";
import { useSession } from "../../../providers/SessionProvider";
import { useThemedStyles } from "../../../providers/ThemeProvider";
import { Theme } from "../../../theme/themes";

type State =
  | { status: "loading" }
  | { status: "ready"; bookings: OwnerBooking[]; sitters: MySitter[] }
  | { status: "error"; message: string };

/**
 * Owner Bookings tab: my bookings with status badges (3B.3) and "Your sitters" (3B.2) →
 * their profile and month. Book care is the one primary action.
 */
export default function OwnerBookings() {
  const styles = useThemedStyles(makeStyles);
  const { profile } = useSession();
  const ownerId = profile?.id;
  const [state, setState] = useState<State>({ status: "loading" });

  const load = useCallback(async () => {
    if (!ownerId) return;
    try {
      const [bookings, sitters] = await Promise.all([listOwnerBookings(ownerId), listMySitters()]);
      setState({ status: "ready", bookings, sitters });
    } catch (error) {
      setState({ status: "error", message: (error as Error).message });
    }
  }, [ownerId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const bookCare = () => router.push("/owner/bookings/new");

  if (state.status === "loading") return <LoadingView />;

  if (state.status === "error") {
    return (
      <Screen>
        <EmptyState
          emoji="📅"
          title="Couldn't load your bookings"
          message={state.message}
          action={{ label: "Try again", onPress: () => void load() }}
        />
      </Screen>
    );
  }

  if (state.bookings.length === 0 && state.sitters.length === 0) {
    return (
      <Screen>
        <EmptyState
          emoji="📅"
          title="No bookings yet"
          message="Book a sitter for your next trip — your requests and stays will show here."
          action={{ label: "Book care", onPress: bookCare }}
        />
      </Screen>
    );
  }

  return (
    <View style={styles.root}>
      <Screen contentStyle={styles.list}>
        {state.bookings.length > 0 ? (
          <View style={styles.section}>
            <Text accessibilityRole="header" style={styles.heading}>
              Your bookings
            </Text>
            {state.bookings.map((booking) => (
              <BookingCard
                key={booking.id}
                booking={booking}
                viewer="owner"
                onPress={() => router.push(`/owner/bookings/${booking.id}`)}
              />
            ))}
          </View>
        ) : null}
        {state.sitters.length > 0 ? (
          <View style={styles.section}>
            <Text accessibilityRole="header" style={styles.heading}>
              Your sitters
            </Text>
            <Text style={styles.hint}>Check their schedules before you plan a trip.</Text>
            {state.sitters.map((sitter) => (
              <SitterCard
                key={sitter.id}
                sitter={sitter}
                note={sitter.bookingCount === 1 ? "1 booking with you" : `${sitter.bookingCount} bookings with you`}
                onPress={() => router.push(`/owner/sitters/${sitter.id}`)}
              />
            ))}
          </View>
        ) : null}
      </Screen>
      <View style={styles.footer}>
        <Button label="Book care" onPress={bookCare} testID="book-care" />
      </View>
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: theme.color.background,
    },
    list: {
      gap: theme.spacing.lg,
    },
    section: {
      gap: theme.spacing.sm,
    },
    heading: {
      fontSize: theme.fontSize.body,
      fontWeight: "600",
      color: theme.color.text,
    },
    hint: {
      fontSize: theme.fontSize.small,
      color: theme.color.textMuted,
    },
    footer: {
      padding: theme.spacing.md,
      maxWidth: 480,
      width: "100%",
      alignSelf: "center",
    },
  });
