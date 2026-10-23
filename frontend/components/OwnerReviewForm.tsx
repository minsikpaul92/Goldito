import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { ChipSuggestions } from "./ChipSuggestions";
import { StarRating } from "./StarRating";
import { Button } from "./ui/Button";
import { TextField } from "./ui/TextField";
import { submitReview } from "../features/completion/completionApi";
import { OWNER_REVIEW_PRESETS, composeComment, presetsFor } from "../features/completion/reviewPresets";
import { useThemedStyles } from "../providers/ThemeProvider";
import { useToast } from "../providers/ToastProvider";
import { Theme } from "../theme/themes";

const COMMENT_MAX = 500;

type Props = {
  bookingId: string;
  sitterName: string;
  /** The review went in (the caller shows what comes next: favorites, a summary). */
  onSent: () => void;
  /** The review screen can lock the button once it knows the stay was already reviewed. */
  locked?: boolean;
};

/**
 * The owner's review of a stay (phase-07C 7C.3): stars, one-tap phrases per star (FB-27), own words, once. Used by the
 * review screen and by the chat.
 */
export function OwnerReviewForm({ bookingId, sitterName, onSent, locked }: Props) {
  const styles = useThemedStyles(makeStyles);
  const toast = useToast();
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  /** Phrases picked for the current stars (FB-27); a new rating offers its own three. */
  const [picked, setPicked] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const presets = presetsFor(OWNER_REVIEW_PRESETS, rating);
  const full = composeComment(picked, comment);

  const rate = (n: number) => {
    setRating(n);
    setPicked((prev) => prev.filter((p) => presetsFor(OWNER_REVIEW_PRESETS, n).includes(p)));
  };
  const togglePreset = (phrase: string) =>
    setPicked((prev) => (prev.includes(phrase) ? prev.filter((p) => p !== phrase) : [...prev, phrase]));

  const send = async () => {
    if (rating < 1 || sending) return;
    setSending(true);
    setError(null);
    try {
      await submitReview(bookingId, rating, full);
      toast.show(`Thanks! ${sitterName} was told`);
      onSent();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSending(false);
    }
  };

  return (
    <View style={styles.form}>
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
        disabled={rating < 1 || sending || !!locked}
        onPress={() => void send()}
        testID="review-send"
      />
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    form: { gap: theme.spacing.md },
    error: { fontSize: theme.fontSize.small, color: theme.color.error },
  });
