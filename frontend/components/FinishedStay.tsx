import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { StyleSheet, Text } from "react-native";

import { Review, StaySummary, getReview, getStaySummary } from "../features/completion/completionApi";
import { formatDay, isoToZoned } from "../features/schedule/dates";
import type { BookingSummary } from "../lib/bookings";
import { useThemedStyles } from "../providers/ThemeProvider";
import { Theme } from "../theme/themes";
import { StarRating } from "./StarRating";
import { StaySummaryCard } from "./StaySummaryCard";
import { Button } from "./ui/Button";
import { Card } from "./ui/Card";

/**
 * The owner's finished booking (phase-07C 7C.2 · 7C.3): "home safe", the Stay summary and — until it is sent —
 * Leave a review (one per stay; afterwards the stars and comment are read-only).
 */
export function FinishedStay({ booking }: { booking: BookingSummary }) {
  const styles = useThemedStyles(makeStyles);
  const [summary, setSummary] = useState<StaySummary | null>(null);
  const [review, setReview] = useState<Review | null | undefined>(undefined);
  const petIds = booking.pets.flatMap((p) => (p.id ? [p.id] : []));
  const from = booking.dropOff?.completedAt ?? booking.dropOff?.at ?? booking.createdAt;
  const to = booking.pickUp?.completedAt ?? new Date().toISOString();

  useFocusEffect(
    useCallback(() => {
      let live = true;
      getReview(booking.id)
        .then((r) => live && setReview(r))
        .catch(() => live && setReview(null));
      if (petIds.length > 0) {
        getStaySummary(petIds, from, to)
          .then((s) => live && setSummary(s))
          .catch(() => undefined);
      }
      return () => {
        live = false;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [booking.id]),
  );

  const period = `${formatDay(isoToZoned(from).day)} – ${formatDay(isoToZoned(to).day)}`;
  const names = booking.pets.map((p) => p.name).join(" & ") || "Your pet";

  return (
    <>
      <Card style={styles.safe} testID="home-safe">
        <Text style={styles.title}>{`${names} ${booking.pets.length > 1 ? "are" : "is"} home safe 🏠`}</Text>
      </Card>
      {summary ? <StaySummaryCard summary={summary} period={period} testID="stay-summary" /> : null}
      {review === undefined ? null : review ? (
        <Card style={styles.review} testID="review-done">
          <Text style={styles.label}>Your review</Text>
          <StarRating value={review.rating} testID="review-stars" />
          {review.comment ? <Text style={styles.body}>{review.comment}</Text> : null}
        </Card>
      ) : (
        <Button
          label="Leave a review ⭐"
          onPress={() => router.push(`/owner/bookings/${booking.id}/review`)}
          testID="leave-review"
        />
      )}
    </>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    safe: { gap: theme.spacing.xs },
    title: { fontSize: theme.fontSize.body, fontWeight: "700", color: theme.color.text },
    review: { gap: theme.spacing.xs },
    label: { fontSize: theme.fontSize.small, fontWeight: "600", color: theme.color.textMuted },
    body: { fontSize: theme.fontSize.body, color: theme.color.text },
  });
