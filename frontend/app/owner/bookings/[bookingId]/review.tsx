import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { StyleSheet, Text } from "react-native";

import { OwnerReviewForm } from "../../../../components/OwnerReviewForm";
import { Button } from "../../../../components/ui/Button";
import { Card } from "../../../../components/ui/Card";
import { EmptyState } from "../../../../components/ui/EmptyState";
import { LoadingView } from "../../../../components/ui/LoadingView";
import { Screen } from "../../../../components/ui/Screen";
import { Sheet } from "../../../../components/ui/Sheet";
import { TextButton } from "../../../../components/ui/TextButton";
import { listFavoriteSitterIds, setFavoriteSitter } from "../../../../features/sitters/sitterApi";
import { getReview } from "../../../../features/completion/completionApi";
import { BookingSummary, getBooking } from "../../../../lib/bookings";
import { useThemedStyles } from "../../../../providers/ThemeProvider";
import { useToast } from "../../../../providers/ToastProvider";
import { Theme } from "../../../../theme/themes";

/** "How was Max and Mochi's stay with Chloe?" — ★1–5 and an optional comment, once (phase-07C 7C.3). */
export default function ReviewScreen() {
  const styles = useThemedStyles(makeStyles);
  const toast = useToast();
  const { bookingId } = useLocalSearchParams<{ bookingId: string }>();
  const [booking, setBooking] = useState<BookingSummary | null | undefined>(undefined);
  const [done, setDone] = useState(false);
  /** After the review: offer to add the sitter to favorites unless they already are (FB-28). */
  const [askFavorite, setAskFavorite] = useState(false);
  const [isFavorite, setIsFavorite] = useState(true);

  useEffect(() => {
    let live = true;
    Promise.all([getBooking(bookingId), getReview(bookingId).catch(() => null)])
      .then(([b, review]) => {
        if (!live) return;
        setBooking(b);
        setDone(!!review);
        if (b) {
          listFavoriteSitterIds()
            .then((ids) => live && setIsFavorite(ids.includes(b.sitterId)))
            .catch(() => undefined);
        }
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
        <EmptyState emoji="⭐" title="Not ready yet" message="You can review a stay once the pets are back home." />
      </Screen>
    );
  }
  // Back to the booking underneath (it refreshes on focus); a direct link has nothing to go back to.
  const leave = (id: string) => {
    if (router.canGoBack()) router.back();
    else router.replace(`/owner/bookings/${id}`);
  };

  if (done && !askFavorite) {
    return (
      <Screen>
        <EmptyState
          emoji="⭐"
          title="Thanks, you already reviewed this stay"
          message="Your review is on the booking."
          action={{ label: "Back to the booking", onPress: () => router.replace(`/owner/bookings/${booking.id}`) }}
        />
      </Screen>
    );
  }

  const names = booking.pets.map((p) => p.name).join(" and ") || "your pet";
  return (
    <Screen testID="review-screen" contentStyle={styles.content}>
      <Card style={styles.card}>
        <Text accessibilityRole="header" style={styles.title}>{`How was ${names}'s stay with ${booking.sitterName}?`}</Text>
        <OwnerReviewForm
          bookingId={booking.id}
          sitterName={booking.sitterName}
          locked={done}
          onSent={() => {
            if (isFavorite) leave(booking.id);
            else {
              setDone(true);
              setAskFavorite(true);
            }
          }}
        />
      </Card>
      <Sheet
        visible={askFavorite}
        title={`Add ${booking.sitterName} to your favorites?`}
        onClose={() => leave(booking.id)}
        testID="favorite-sheet"
      >
        <Text style={styles.hint}>{`Favorites show first when you book. ${booking.sitterName} isn't told.`}</Text>
        <Button
          label="Add to favorites"
          onPress={() => {
            void setFavoriteSitter(booking.sitterId, true)
              .then(() => toast.show(`${booking.sitterName} is a favorite`))
              .catch((e: Error) => toast.show(e.message))
              .finally(() => leave(booking.id));
          }}
          testID="favorite-add"
        />
        <TextButton label="Not now" onPress={() => leave(booking.id)} testID="favorite-skip" />
      </Sheet>
    </Screen>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    content: { gap: theme.spacing.md },
    card: { gap: theme.spacing.md },
    title: { fontSize: theme.fontSize.title, fontWeight: theme.fontWeight.bold, color: theme.color.text },
    hint: { fontSize: theme.fontSize.small, color: theme.color.textMuted },
  });
