import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { StyleSheet, Text } from "react-native";

import { Review, getReview } from "../features/completion/completionApi";
import { useThemedStyles } from "../providers/ThemeProvider";
import { Theme } from "../theme/themes";
import { StarRating } from "./StarRating";
import { Card } from "./ui/Card";

/**
 * The owner's review of a finished stay, on the sitter's booking (FB-29). The "left you N ⭐" notice opens this
 * page, so the stars and comment stay readable after the notice is gone. Read through RLS (the stay's sitter).
 */
export function ReceivedReview({
  bookingId,
  ownerName,
  review: given,
}: {
  bookingId: string;
  ownerName: string;
  /** The chat already reads (and watches) the review: use it instead of loading it here. */
  review?: Review | null;
}) {
  const styles = useThemedStyles(makeStyles);
  const [loaded, setReview] = useState<Review | null | undefined>(undefined);
  const review = given !== undefined ? given : loaded;

  useFocusEffect(
    useCallback(() => {
      if (given !== undefined) return;
      let live = true;
      getReview(bookingId)
        .then((r) => live && setReview(r))
        .catch(() => live && setReview(null));
      return () => {
        live = false;
      };
    }, [bookingId, given]),
  );

  if (review === undefined) return null;
  return (
    <Card style={styles.card} testID="received-review">
      <Text style={styles.label}>{`${ownerName}'s review`}</Text>
      {review ? (
        <>
          <StarRating value={review.rating} size={24} testID="received-review-stars" />
          {review.comment ? <Text style={styles.body}>{review.comment}</Text> : null}
        </>
      ) : (
        <Text style={styles.muted}>{`${ownerName} hasn't left a review yet.`}</Text>
      )}
    </Card>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    card: { gap: theme.spacing.xs },
    label: { fontSize: theme.fontSize.small, fontWeight: theme.fontWeight.semibold, color: theme.color.textMuted },
    body: { fontSize: theme.fontSize.body, color: theme.color.text },
    muted: { fontSize: theme.fontSize.small, color: theme.color.textMuted },
  });
