import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { StyleSheet, Text } from "react-native";

import { ChipSuggestions } from "../../../../components/ChipSuggestions";
import { StarRating } from "../../../../components/StarRating";
import { Button } from "../../../../components/ui/Button";
import { Card } from "../../../../components/ui/Card";
import { EmptyState } from "../../../../components/ui/EmptyState";
import { LoadingView } from "../../../../components/ui/LoadingView";
import { Screen } from "../../../../components/ui/Screen";
import { Sheet } from "../../../../components/ui/Sheet";
import { TextButton } from "../../../../components/ui/TextButton";
import { listFavoriteSitterIds, setFavoriteSitter } from "../../../../features/sitters/sitterApi";
import { TextField } from "../../../../components/ui/TextField";
import { getReview, submitReview } from "../../../../features/completion/completionApi";
import { OWNER_REVIEW_PRESETS, composeComment, presetsFor } from "../../../../features/completion/reviewPresets";
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
  /** Phrases picked for the current stars (FB-27); a new rating offers its own three. */
  const [picked, setPicked] = useState<string[]>([]);
  const presets = presetsFor(OWNER_REVIEW_PRESETS, rating);
  const full = composeComment(picked, comment);
  const rate = (n: number) => {
    setRating(n);
    setPicked((prev) => prev.filter((p) => presetsFor(OWNER_REVIEW_PRESETS, n).includes(p)));
  };
  const togglePreset = (phrase: string) =>
    setPicked((prev) => (prev.includes(phrase) ? prev.filter((p) => p !== phrase) : [...prev, phrase]));
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
      await submitReview(booking.id, rating, full);
      toast.show(`Thanks! ${booking.sitterName} was told ⭐`);
      if (isFavorite) leave(booking.id);
      else {
        setDone(true);
        setAskFavorite(true);
      }
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
        <StarRating value={rating} onChange={rate} size={40} testID="review-rating" />
        {presets.length > 0 ? (
          <ChipSuggestions
            chips={presets.map((p) => ({ id: p, kind: "episode", label: p, source: "custom", check: null, media_id: null }))}
            off={new Set(presets.filter((p) => !picked.includes(p)))}
            onToggle={togglePreset}
            testIDPrefix="review-preset"
          />
        ) : null}
        <TextField
          label="Say a few words (optional)"
          value={comment}
          maxLength={Math.max(0, COMMENT_MAX - (picked.length ? picked.join(" · ").length + 1 : 0))}
          multiline
          onChangeText={setComment}
          placeholder="What did you like?"
          testID="review-comment"
        />
        {error ? <Text style={styles.error} testID="review-error">{error}</Text> : null}
        <Button
          label={sending ? "Sending…" : "Send review"}
          disabled={rating < 1 || sending || done}
          onPress={() => void send()}
          testID="review-send"
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
          label="⭐ Add to favorites"
          onPress={() => {
            void setFavoriteSitter(booking.sitterId, true)
              .then(() => toast.show(`${booking.sitterName} is a favorite ⭐`))
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
    title: { fontSize: theme.fontSize.title, fontWeight: "700", color: theme.color.text },
    error: { fontSize: theme.fontSize.small, color: theme.color.error },
    hint: { fontSize: theme.fontSize.small, color: theme.color.textMuted },
  });
