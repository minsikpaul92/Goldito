import { router, useFocusEffect } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { StyleSheet, Text } from "react-native";

import {
  LifeRecord,
  Review,
  StaySummary,
  getReview,
  getStaySummary,
  listBookingRecords,
  requestLifeRecord,
} from "../features/completion/completionApi";
import { formatDay, isoToZoned } from "../features/schedule/dates";
import type { BookingSummary } from "../lib/bookings";
import { useThemedStyles } from "../providers/ThemeProvider";
import { Theme } from "../theme/themes";
import { LifeRecordCard } from "./LifeRecordCard";
import { StarRating } from "./StarRating";
import { StaySummaryCard } from "./StaySummaryCard";
import { Button } from "./ui/Button";
import { TextButton } from "./ui/TextButton";
import { Card } from "./ui/Card";

/** Right after Returned the sitter's request is still writing the records: watch for them before asking again. */
const RECENT_RETURN_MS = 3 * 60_000;
const WATCH_EVERY_MS = 5_000;
const WATCH_FOR_MS = 90_000;

/**
 * The owner's finished booking (phase-07C 7C.2 · 7C.3): "home safe", the Stay summary and — until it is sent —
 * Leave a review (one per stay; afterwards the stars and comment are read-only).
 */
export function FinishedStay({ booking }: { booking: BookingSummary }) {
  const styles = useThemedStyles(makeStyles);
  const [summary, setSummary] = useState<StaySummary | null>(null);
  const [review, setReview] = useState<Review | null | undefined>(undefined);
  const [records, setRecords] = useState<LifeRecord[] | undefined>(undefined);
  const [writing, setWriting] = useState<"idle" | "writing" | "failed">("idle");
  const [writeError, setWriteError] = useState<string | null>(null);
  const busy = useRef(false);
  const petIds = booking.pets.flatMap((p) => (p.id ? [p.id] : []));
  const from = booking.dropOff?.completedAt ?? booking.dropOff?.at ?? booking.createdAt;
  const to = booking.pickUp?.completedAt ?? new Date().toISOString();

  /** Show the records once every pet has one; false while some are still missing. */
  const showIfComplete = useCallback(async () => {
    const found = await listBookingRecords(petIds, booking.id);
    if (found.length < petIds.length) return false;
    setRecords(found);
    setWriting("idle");
    return true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [booking.id]);

  /**
   * Ask for the Life Records (idempotent), then show them. The sitter's Returned already asked; this is the safety net.
   * Right after Returned that request is usually still writing, so first watch for its records instead of asking again.
   */
  const writeRecords = useCallback(
    async ({ waitForReturned = false } = {}) => {
      if (busy.current) return;
      busy.current = true;
      setWriting("writing");
      setWriteError(null);
      try {
        const returnedAt = Date.parse(booking.pickUp?.completedAt ?? "");
        if (waitForReturned && Date.now() - returnedAt < RECENT_RETURN_MS) {
          for (const until = Date.now() + WATCH_FOR_MS; Date.now() < until; ) {
            await new Promise((r) => setTimeout(r, WATCH_EVERY_MS));
            if (await showIfComplete()) return;
          }
        }
        await requestLifeRecord(booking.id);
        setRecords(await listBookingRecords(petIds, booking.id));
        setWriting("idle");
      } catch (e) {
        // The other request may have finished meanwhile: its records are the answer, not an error.
        if (await showIfComplete().catch(() => false)) return;
        setWriteError((e as Error).message);
        setWriting("failed");
      } finally {
        busy.current = false;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [booking.id],
  );

  useFocusEffect(
    useCallback(() => {
      let live = true;
      listBookingRecords(petIds, booking.id)
        .then((r) => {
          if (!live) return;
          setRecords(r);
          if (r.length < petIds.length) void writeRecords({ waitForReturned: true });
        })
        .catch(() => live && setRecords([]));
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
      {records && records.length > 0
        ? records.map((r) => (
            <LifeRecordCard
              key={r.id}
              record={r}
              petName={booking.pets.find((p) => p.id === r.petId)?.name ?? "Your pet"}
              testID={`life-record-${r.petId}`}
            />
          ))
        : null}
      {writing === "writing" ? (
        <Card style={styles.safe} testID="record-writing">
          <Text style={styles.label}>📖 Writing the Life Record…</Text>
        </Card>
      ) : null}
      {writing === "failed" ? (
        <Card style={styles.safe} testID="record-failed">
          <Text style={styles.label}>{writeError ?? "Couldn't write the Life Record."}</Text>
          <TextButton label="Retry" onPress={() => void writeRecords()} testID="record-retry" />
        </Card>
      ) : null}
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
