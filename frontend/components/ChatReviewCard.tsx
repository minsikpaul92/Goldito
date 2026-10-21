import { useCallback, useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { FavoriteHeart } from "./FavoriteHeart";
import { OwnerNoteCard } from "./OwnerNote";
import { OwnerReviewForm } from "./OwnerReviewForm";
import { ReceivedReview } from "./ReceivedReview";
import { StarRating } from "./StarRating";
import { Card } from "./ui/Card";
import { Review, getReview } from "../features/completion/completionApi";
import type { BookingSummary } from "../lib/bookings";
import { useThemedStyles } from "../providers/ThemeProvider";
import { Theme } from "../theme/themes";

const WATCH_MS = 10_000;

/**
 * The reviews, in the chat (3D.9) once the pets are home. The owner rates the sitter right here (public, one per stay)
 * and can heart them; the sitter reads that review and keeps a private note about the owner (011g, nobody else reads it).
 */
export function ChatReviewCard({ booking, viewer }: { booking: BookingSummary; viewer: "owner" | "sitter" }) {
  const styles = useThemedStyles(makeStyles);
  const [review, setReview] = useState<Review | null | undefined>(undefined);
  const pets = booking.pets.map((p) => p.name).join(" and ") || "your pet";

  const load = useCallback(() => {
    getReview(booking.id)
      .then(setReview)
      .catch(() => setReview((r) => (r === undefined ? null : r)));
  }, [booking.id]);

  useEffect(() => {
    load();
    // the sitter's chat follows the owner's review without a refresh
    const poll = viewer === "sitter" ? setInterval(load, WATCH_MS) : undefined;
    return () => {
      if (poll) clearInterval(poll);
    };
  }, [load, viewer]);

  if (viewer === "sitter") {
    return (
      <View style={styles.wrap}>
        <ReceivedReview bookingId={booking.id} ownerName={booking.ownerName} review={review} />
        <OwnerNoteCard bookingId={booking.id} ownerName={booking.ownerName} />
      </View>
    );
  }
  if (review === undefined) return null;
  return (
    <View style={styles.wrap}>
      <Card style={styles.card} testID="chat-review">
        {review ? (
          <>
            <Text style={styles.title}>Your review</Text>
            <StarRating value={review.rating} size={28} testID="chat-review-stars" />
            {review.comment ? <Text style={styles.body}>{review.comment}</Text> : null}
          </>
        ) : (
          <>
            <Text style={styles.title}>{`How was ${pets}'s stay with ${booking.sitterName}?`}</Text>
            <OwnerReviewForm bookingId={booking.id} sitterName={booking.sitterName} onSent={load} />
          </>
        )}
        {review ? <FavoriteHeart sitterId={booking.sitterId} sitterName={booking.sitterName} /> : null}
      </Card>
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    wrap: { width: "92%", alignSelf: "center", gap: theme.spacing.sm },
    card: { gap: theme.spacing.sm },
    title: { fontSize: theme.fontSize.body, fontWeight: theme.fontWeight.bold, color: theme.color.text },
    body: { fontSize: theme.fontSize.body, color: theme.color.text },
  });
