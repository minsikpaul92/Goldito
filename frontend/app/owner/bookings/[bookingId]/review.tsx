import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { StyleSheet, Text } from "react-native";

import { FavoriteHeart } from "../../../../components/FavoriteHeart";
import { OwnerReviewForm } from "../../../../components/OwnerReviewForm";
import { Button } from "../../../../components/ui/Button";
import { Card } from "../../../../components/ui/Card";
import { EmptyState } from "../../../../components/ui/EmptyState";
import { LoadingView } from "../../../../components/ui/LoadingView";
import { Screen } from "../../../../components/ui/Screen";
import { getReview } from "../../../../features/completion/completionApi";
import { BookingSummary, getBooking } from "../../../../lib/bookings";
import { useThemedStyles } from "../../../../providers/ThemeProvider";
import { Theme } from "../../../../theme/themes";

/** "How was Max and Mochi's stay with Chloe?" — ★1–5 and an optional comment, once (phase-07C 7C.3). */
export default function ReviewScreen() {
  const styles = useThemedStyles(makeStyles);
  const { bookingId } = useLocalSearchParams<{ bookingId: string }>();
  const [booking, setBooking] = useState<BookingSummary | null | undefined>(undefined);
  /** "earlier": reviewed before this visit; "now": just sent. Either way the favorites heart follows (FB-28, #251). */
  const [done, setDone] = useState<"earlier" | "now" | null>(null);

  useEffect(() => {
    let live = true;
    Promise.all([getBooking(bookingId), getReview(bookingId).catch(() => null)])
      .then(([b, review]) => {
        if (!live) return;
        setBooking(b);
        setDone(review ? "earlier" : null);
      })
      .catch(() => live && setBooking(null));
    return () => {
      live = false;
    };
  }, [bookingId]);

  if (booking === undefined) return <LoadingView />;
  if (!booking || booking.status !== "confirmed" || !booking.pickUp?.completedAt) {
    return (
      <Screen>
        <EmptyState icon="home" title="Not ready yet" message="You can review a stay once the pets are back home." />
      </Screen>
    );
  }
  // Back to the booking underneath (it refreshes on focus); a direct link has nothing to go back to.
  const leave = () => {
    if (router.canGoBack()) router.back();
    else router.replace(`/owner/bookings/${booking.id}`);
  };

  if (done) {
    // The same heart as the chat and the sitter's page; a favorite already shows it filled, nothing is asked.
    return (
      <Screen testID="review-screen" contentStyle={styles.content}>
        <Card style={styles.card}>
          <Text accessibilityRole="header" style={styles.title}>
            {done === "now" ? "Thanks for your review" : "Thanks, you already reviewed this stay"}
          </Text>
          <FavoriteHeart sitterId={booking.sitterId} sitterName={booking.sitterName} />
        </Card>
        <Button label="Back to the booking" onPress={leave} testID="review-back" />
      </Screen>
    );
  }

  const names = booking.pets.map((p) => p.name).join(" and ") || "your pet";
  return (
    <Screen testID="review-screen" contentStyle={styles.content}>
      <Card style={styles.card}>
        <Text accessibilityRole="header" style={styles.title}>{`How was ${names}'s stay with ${booking.sitterName}?`}</Text>
        <OwnerReviewForm bookingId={booking.id} sitterName={booking.sitterName} onSent={() => setDone("now")} />
      </Card>
    </Screen>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    content: { gap: theme.spacing.md },
    card: { gap: theme.spacing.md },
    title: { fontSize: theme.fontSize.title, fontWeight: theme.fontWeight.bold, color: theme.color.text },
  });
