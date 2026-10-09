import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { OwnerNote, getOwnerNote, listOwnerNotes, saveOwnerNote } from "../features/completion/completionApi";
import { SITTER_REVIEW_PRESETS, composeComment, presetsFor } from "../features/completion/reviewPresets";
import { formatDay, isoToZoned } from "../features/schedule/dates";
import { useThemedStyles } from "../providers/ThemeProvider";
import { useToast } from "../providers/ToastProvider";
import { Theme } from "../theme/themes";
import { ChipSuggestions } from "./ChipSuggestions";
import { StarRating } from "./StarRating";
import { Button } from "./ui/Button";
import { Card } from "./ui/Card";
import { TextButton } from "./ui/TextButton";
import { TextField } from "./ui/TextField";

const COMMENT_MAX = 500;

/** The line every private-note card carries: the owner never sees it and is never told (011g). */
const privateLine = (owner: string) => `🔒 Only you can see this — ${owner} is never told.`;

/**
 * The sitter rates the owner after a stay (FB-25): stars, one-tap phrases per star, own words — private to the sitter.
 * On a finished booking (right after Returned, or later from Past). Saving again edits it.
 */
export function OwnerNoteCard({ bookingId, ownerName }: { bookingId: string; ownerName: string }) {
  const styles = useThemedStyles(makeStyles);
  const toast = useToast();
  const [note, setNote] = useState<OwnerNote | null | undefined>(undefined);
  const [editing, setEditing] = useState(false);
  const [rating, setRating] = useState(0);
  const [picked, setPicked] = useState<string[]>([]);
  const [words, setWords] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let live = true;
      getOwnerNote(bookingId)
        .then((n) => live && setNote(n))
        .catch(() => live && setNote(null));
      return () => {
        live = false;
      };
    }, [bookingId]),
  );

  if (note === undefined) return null;
  const presets = presetsFor(SITTER_REVIEW_PRESETS, rating);
  const rate = (n: number) => {
    setRating(n);
    setPicked((prev) => prev.filter((p) => presetsFor(SITTER_REVIEW_PRESETS, n).includes(p)));
  };
  const startEditing = () => {
    setRating(note?.rating ?? 0);
    setPicked([]);
    setWords(note?.comment ?? "");
    setEditing(true);
  };
  const save = async () => {
    if (rating < 1 || saving) return;
    setSaving(true);
    setError(null);
    try {
      const comment = composeComment(picked, words);
      await saveOwnerNote(bookingId, rating, comment);
      setNote({ bookingId, rating, comment: comment || null, createdAt: note?.createdAt ?? new Date().toISOString() });
      setEditing(false);
      toast.show("Saved — only you can see it");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (note && !editing) {
    return (
      <Card style={styles.card} testID="owner-note">
        <Text style={styles.label}>{`Your note about ${ownerName}`}</Text>
        <StarRating value={note.rating} size={24} testID="owner-note-stars" />
        {note.comment ? <Text style={styles.body}>{note.comment}</Text> : null}
        <Text style={styles.muted}>{privateLine(ownerName)}</Text>
        <TextButton label="Edit" onPress={startEditing} testID="owner-note-edit" />
      </Card>
    );
  }
  if (!note && !editing) {
    return (
      <Card style={styles.card} testID="owner-note">
        <Text style={styles.label}>{`How was it working with ${ownerName}?`}</Text>
        <Text style={styles.muted}>{privateLine(ownerName)}</Text>
        <Button label={`⭐ Rate ${ownerName}`} variant="secondary" onPress={startEditing} testID="owner-note-start" />
      </Card>
    );
  }
  return (
    <Card style={styles.card} testID="owner-note">
      <Text style={styles.label}>{`How was it working with ${ownerName}?`}</Text>
      <Text style={styles.muted}>{privateLine(ownerName)}</Text>
      <StarRating value={rating} onChange={rate} size={32} testID="owner-note-rating" />
      {presets.length > 0 ? (
        <ChipSuggestions
          chips={presets.map((p) => ({ id: p, kind: "episode", label: p, source: "custom", check: null, media_id: null }))}
          off={new Set(presets.filter((p) => !picked.includes(p)))}
          onToggle={(p) => setPicked((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]))}
          testIDPrefix="owner-note-preset"
        />
      ) : null}
      <TextField
        label="A few words for yourself (optional)"
        value={words}
        maxLength={Math.max(0, COMMENT_MAX - (picked.length ? picked.join(" · ").length + 1 : 0))}
        multiline
        onChangeText={setWords}
        testID="owner-note-comment"
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <View style={styles.actions}>
        <Button label={saving ? "Saving…" : "Save note"} disabled={rating < 1 || saving} onPress={() => void save()} testID="owner-note-save" />
        <TextButton label="Cancel" onPress={() => setEditing(false)} testID="owner-note-cancel" />
      </View>
    </Card>
  );
}

/** My earlier notes about this owner, on their new request or booking (FB-29) — private to me. */
export function PastOwnerNotes({ ownerId, ownerName, bookingId }: { ownerId: string; ownerName: string; bookingId: string }) {
  const styles = useThemedStyles(makeStyles);
  const [notes, setNotes] = useState<OwnerNote[]>([]);

  useFocusEffect(
    useCallback(() => {
      let live = true;
      listOwnerNotes(ownerId, bookingId)
        .then((n) => live && setNotes(n))
        .catch(() => undefined);
      return () => {
        live = false;
      };
    }, [ownerId, bookingId]),
  );

  if (notes.length === 0) return null;
  return (
    <Card style={styles.card} testID="past-owner-notes">
      <Text style={styles.label}>{`Your notes from earlier stays with ${ownerName}`}</Text>
      {notes.map((n) => (
        <View key={n.bookingId} style={styles.past} testID={`past-owner-note-${n.bookingId}`}>
          <StarRating value={n.rating} size={18} />
          {n.comment ? <Text style={styles.body}>{n.comment}</Text> : null}
          <Text style={styles.muted}>{formatDay(isoToZoned(n.createdAt).day)}</Text>
        </View>
      ))}
      <Text style={styles.muted}>{privateLine(ownerName)}</Text>
    </Card>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    card: { gap: theme.spacing.sm },
    label: { fontSize: theme.fontSize.small, fontWeight: "600", color: theme.color.textMuted },
    body: { fontSize: theme.fontSize.body, color: theme.color.text },
    muted: { fontSize: theme.fontSize.small, color: theme.color.textMuted },
    error: { fontSize: theme.fontSize.small, color: theme.color.error },
    actions: { gap: theme.spacing.xs },
    past: { gap: 2 },
  });
