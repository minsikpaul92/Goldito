import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { StyleSheet, Text } from "react-native";

import { StarRating } from "../../../../components/StarRating";
import { Button } from "../../../../components/ui/Button";
import { Card } from "../../../../components/ui/Card";
import { EmptyState } from "../../../../components/ui/EmptyState";
import { LoadingView } from "../../../../components/ui/LoadingView";
import { Screen } from "../../../../components/ui/Screen";
import { TextField } from "../../../../components/ui/TextField";
import { getReview, submitReview } from "../../../../features/completion/completionApi";
import { BookingSummary, getBooking } from "../../../../lib/bookings";
import { useThemedStyles } from "../../../../providers/ThemeProvider";
import { useToast } from "../../../../providers/ToastProvider";
import { Theme } from "../../../../theme/themes";

const COMMENT_MAX = 500;

/** "How was Max and Mochi's stay with Chloe?" — ★1–5 and an optional comment, once (phase-07C 7C.3). */
export default function ReviewScreen() {
  const styles = useThemedStyles(makeStyles);
  const toast = useToast();
  const { bookingId } = useLocalSearchParams<{ bookingId: string }>();
  const [booking, setBooking] = useState<BookingSummary | null | undefined>(undefined);
  const [done, setDone] = useState(false);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    Promise.all([getBooking(bookingId), getReview(bookingId).catch(() => null)])
      .then(([b, review]) => {
        if (!live) return;
        setBooking(b);
        setDone(!!review);
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
  if (done) {
    return (
      <Screen>
        <EmptyState
          emoji="⭐"
          title="Thanks — you already reviewed this stay"
          message="Your review is on the booking."
          action={{ label: "Back to the booking", onPress: () => router.replace(`/owner/bookings/${booking.id}`) }}
        />
      </Screen>
    );
  }

  const names = booking.pets.map((p) => p.name).join(" and ") || "your pet";
  const send = async () => {
    if (rating < 1 || sending) return;
    setSending(true);
    setError(null);
    try {
      await submitReview(booking.id, rating, comment);
      toast.show(`Thanks! ${booking.sitterName} was told ⭐`);
      // Back to the booking underneath (it refreshes on focus); a direct link has nothing to go back to.
      if (router.canGoBack()) router.back();
      else router.replace(`/owner/bookings/${booking.id}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSending(false);
    }
  };

  return (
    <Screen testID="review-screen" contentStyle={styles.content}>
      <Card style={styles.card}>
        <Text accessibilityRole="header" style={styles.title}>{`How was ${names}'s stay with ${booking.sitterName}?`}</Text>
        <StarRating value={rating} onChange={setRating} size={40} testID="review-rating" />
        <TextField
          label="Say a few words (optional)"
          value={comment}
          maxLength={COMMENT_MAX}
          multiline
          onChangeText={setComment}
          placeholder="What did you like?"
          testID="review-comment"
        />
        {error ? <Text style={styles.error} testID="review-error">{error}</Text> : null}
        <Button
          label={sending ? "Sending…" : "Send review"}
          disabled={rating < 1 || sending}
          onPress={() => void send()}
          testID="review-send"
        />
      </Card>
    </Screen>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    content: { gap: theme.spacing.md },
    card: { gap: theme.spacing.md },
    title: { fontSize: theme.fontSize.title, fontWeight: "700", color: theme.color.text },
    error: { fontSize: theme.fontSize.small, color: theme.color.error },
  });
