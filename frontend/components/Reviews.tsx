import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { getOwnerRatingSummary, getRatingSummary } from "../features/completion/completionApi";
import { formatDay, isoToZoned } from "../features/schedule/dates";
import { useThemedStyles } from "../providers/ThemeProvider";
import { Theme } from "../theme/themes";
import { StarRating } from "./StarRating";
import { Card } from "./ui/Card";

type Item = { key: string; rating: number; comment: string | null; reviewer: string; createdAt: string };

/** Average, count and every review, newest first. Nothing at all while there are none. */
function ReviewsCard({ title, avg, count, items, testID }: { title: string; avg: number | null; count: number; items: Item[]; testID: string }) {
  const styles = useThemedStyles(makeStyles);
  if (count === 0 || avg == null) return null;
  return (
    <Card style={styles.card} testID={testID}>
      <Text style={styles.label}>{title}</Text>
      <Text style={styles.body} testID={`${testID}-line`}>
        {`★ ${avg.toFixed(1)} · ${count} ${count === 1 ? "review" : "reviews"}`}
      </Text>
      {items.map((r) => (
        <View key={r.key} style={styles.item} testID={`${testID}-item`}>
          <StarRating value={r.rating} size={16} />
          {r.comment ? <Text style={styles.body}>{r.comment}</Text> : null}
          <Text style={styles.muted}>{`${r.reviewer} · ${formatDay(isoToZoned(r.createdAt).day)}`}</Text>
        </View>
      ))}
    </Card>
  );
}

/**
 * What sitters said about an owner (015s), for the owner and for any sitter. On a booking, the review of that same
 * booking is left out (its own card shows it).
 */
export function OwnerReviews({ ownerId, title, exceptBookingId }: { ownerId: string; title: string; exceptBookingId?: string }) {
  const [summary, setSummary] = useState<Awaited<ReturnType<typeof getOwnerRatingSummary>> | null>(null);

  useFocusEffect(
    useCallback(() => {
      let live = true;
      void getOwnerRatingSummary(ownerId).then((s) => live && setSummary(s));
      return () => {
        live = false;
      };
    }, [ownerId]),
  );

  if (!summary) return null;
  const items = summary.reviews
    .filter((r) => r.bookingId !== exceptBookingId)
    .map((r) => ({ key: r.bookingId, rating: r.rating, comment: r.comment, reviewer: r.mine ? "You" : r.reviewer, createdAt: r.createdAt }));
  if (items.length === 0) return null;
  return <ReviewsCard title={title} avg={summary.avg} count={summary.count} items={items} testID="owner-reviews" />;
}

/** Every review owners left a sitter, for the sitter to learn from (their Profile). */
export function SitterReviews({ sitterId, title }: { sitterId: string; title: string }) {
  const [summary, setSummary] = useState<Awaited<ReturnType<typeof getRatingSummary>> | null>(null);

  useFocusEffect(
    useCallback(() => {
      let live = true;
      void getRatingSummary(sitterId).then((s) => live && setSummary(s));
      return () => {
        live = false;
      };
    }, [sitterId]),
  );

  if (!summary) return null;
  const items = summary.recent.map((r, i) => ({ key: `${r.createdAt}-${i}`, ...r }));
  return <ReviewsCard title={title} avg={summary.avg} count={summary.count} items={items} testID="sitter-reviews" />;
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    card: { gap: theme.spacing.sm },
    label: { fontSize: theme.fontSize.small, fontWeight: theme.fontWeight.semibold, color: theme.color.textMuted },
    body: { fontSize: theme.fontSize.body, color: theme.color.text },
    muted: { fontSize: theme.fontSize.small, color: theme.color.textMuted },
    item: { gap: 2 },
  });
