import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { BookingCard } from "../../../components/BookingCard";
import { SitterCard } from "../../../components/SitterCard";
import { Card } from "../../../components/ui/Card";
import { Button } from "../../../components/ui/Button";
import { EmptyState } from "../../../components/ui/EmptyState";
import { LoadingView } from "../../../components/ui/LoadingView";
import { Screen } from "../../../components/ui/Screen";
import { OwnerInquiryCard, listOwnerInquiries } from "../../../features/inquiries/inquiryApi";
import { formatDay, isoToZoned } from "../../../features/schedule/dates";
import {
  MySitter,
  SERVICE_LABEL,
  SitterSummary,
  listMySitters,
  listSitters,
} from "../../../features/sitters/sitterApi";
import { OwnerBooking, listOwnerBookings } from "../../../lib/bookings";
import { useSession } from "../../../providers/SessionProvider";
import { useThemedStyles } from "../../../providers/ThemeProvider";
import { useOnBookingChange } from "../../../providers/NotificationsProvider";
import { Theme } from "../../../theme/themes";

type State =
  | { status: "loading" }
  | {
      status: "ready";
      bookings: OwnerBooking[];
      sitters: MySitter[];
      inquiries: OwnerInquiryCard[];
      /** Sitters on Goldito, when the owner has none of their own yet (FB-32). */
      others: SitterSummary[];
    }
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
      const [bookings, sitters, inquiries] = await Promise.all([
        listOwnerBookings(ownerId),
        listMySitters(),
        listOwnerInquiries().catch(() => [] as OwnerInquiryCard[]),
      ]);
      // A first-time owner sees the sitters on Goldito, so a profile (and "Ask before booking") is one tap away.
      const others = sitters.length === 0 ? await listSitters().catch(() => [] as SitterSummary[]) : [];
      setState({ status: "ready", bookings, sitters, inquiries, others });
    } catch (error) {
      setState({ status: "error", message: (error as Error).message });
    }
  }, [ownerId]);

  useOnBookingChange(() => void load());

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

  const nothingYet = state.bookings.length === 0 && state.inquiries.length === 0;
  if (nothingYet && state.sitters.length === 0 && state.others.length === 0) {
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
        {state.inquiries.length > 0 ? (
          <View style={styles.section} testID="owner-questions">
            <Text accessibilityRole="header" style={styles.heading}>
              Your questions
            </Text>
            {state.inquiries.map((inq) => (
              <Pressable
                key={inq.id}
                accessibilityRole="button"
                onPress={() => router.push(`/owner/inquiries/${inq.id}`)}
                testID={`question-card-${inq.id}`}
              >
                <Card style={styles.question}>
                  <Text style={styles.questionTitle}>{`${inq.sitterName} · ${inq.petNames.join(", ")}`}</Text>
                  <Text style={styles.hint}>
                    {`${SERVICE_LABEL[inq.serviceType].replace(/^\S+\s/, "")} · ${formatDay(isoToZoned(inq.dropOffAt).day)} – ${formatDay(isoToZoned(inq.pickUpAt).day)}`}
                  </Text>
                  <Text style={inq.state === "replied" && inq.status === "open" ? styles.ready : styles.hint}>
                    {inq.status === "booked"
                      ? "Booking requested"
                      : inq.state === "replied"
                        ? "💬 Reply ready"
                        : `Waiting for ${inq.sitterName}`}
                  </Text>
                </Card>
              </Pressable>
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
                note={`${sitter.isFavorite ? "★ Favorite · " : ""}${sitter.bookingCount === 1 ? "1 booking with you" : `${sitter.bookingCount} bookings with you`}`}
                onPress={() => router.push(`/owner/sitters/${sitter.id}`)}
              />
            ))}
          </View>
        ) : null}
        {state.others.length > 0 ? (
          <View style={styles.section} testID="sitters-on-goldito">
            <Text accessibilityRole="header" style={styles.heading}>
              Sitters on Goldito
            </Text>
            <Text style={styles.hint}>
              {nothingYet
                ? "Open a profile to ask before booking — or Book care to see who's free for your dates."
                : "Open a profile to ask before booking."}
            </Text>
            {state.others.map((sitter) => (
              <SitterCard key={sitter.id} sitter={sitter} onPress={() => router.push(`/owner/sitters/${sitter.id}`)} />
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
    question: { gap: theme.spacing.xs },
    questionTitle: { fontSize: theme.fontSize.body, fontWeight: "700", color: theme.color.text },
    ready: { fontSize: theme.fontSize.small, fontWeight: "700", color: theme.color.primary },
    footer: {
      padding: theme.spacing.md,
      maxWidth: 480,
      width: "100%",
      alignSelf: "center",
    },
  });
