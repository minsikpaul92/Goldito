import { useCallback, useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { refreshLifeRecord } from "../../features/completion/completionApi";
import { PetReview, REVIEW_NOTE_MAX, listBookingReviews, savePetReview, suggestReviewChips } from "../../features/pets/reviewApi";
import { useThemedStyles } from "../../providers/ThemeProvider";
import { useToast } from "../../providers/ToastProvider";
import { Theme } from "../../theme/themes";
import { ChipSuggestions } from "../ChipSuggestions";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { TextButton } from "../ui/TextButton";
import { TextField } from "../ui/TextField";

type Pet = { id?: string; name: string };
type Props = { bookingId: string; pets: Pet[]; ownerName: string };

const sharedLine = (owner: string) => `${owner} and other sitters can see this.`;

/**
 * After Returned (#407): the sitter reviews each pet of the stay by picking chips from the stay (D38), with an
 * optional short note. Shared with the pet's owner and other sitters (015u). Saving again edits it; each save writes
 * the pet's Life Record again with the review in it.
 */
export function StayPetReviews({ bookingId, pets, ownerName }: Props) {
  const [reviews, setReviews] = useState<PetReview[] | null>(null);

  const load = useCallback(() => {
    void listBookingReviews(bookingId).then(setReviews);
  }, [bookingId]);
  useEffect(load, [load]);

  if (reviews === null) return null;
  return (
    <>
      {pets.flatMap((pet) =>
        pet.id
          ? [
              <PetReviewCard
                key={pet.id}
                bookingId={bookingId}
                petId={pet.id}
                petName={pet.name}
                ownerName={ownerName}
                review={reviews.find((r) => r.petId === pet.id) ?? null}
                onSaved={load}
              />,
            ]
          : [],
      )}
    </>
  );
}

type CardProps = {
  bookingId: string;
  petId: string;
  petName: string;
  ownerName: string;
  review: PetReview | null;
  onSaved: () => void;
};

function PetReviewCard({ bookingId, petId, petName, ownerName, review, onSaved }: CardProps) {
  const styles = useThemedStyles(makeStyles);
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [chips, setChips] = useState<string[] | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [noteOpen, setNoteOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startEditing = () => {
    setPicked(review?.chips ?? []);
    setNote(review?.note ?? "");
    setNoteOpen(!!review?.note);
    setError(null);
    setEditing(true);
    if (chips === null) {
      void suggestReviewChips(bookingId, petId).then((suggested) =>
        // Chips already in the saved review stay on offer, so editing never loses one.
        setChips([...(review?.chips ?? []), ...suggested.filter((c) => !review?.chips.includes(c))]),
      );
    }
  };
  const save = async () => {
    if (saving || (picked.length === 0 && !note.trim())) return;
    setSaving(true);
    setError(null);
    try {
      await savePetReview(bookingId, petId, picked, note);
      // The review goes into the pet's Life Record, for the next sitter.
      const recorded = await refreshLifeRecord(bookingId, petId).then(
        () => true,
        () => false,
      );
      setEditing(false);
      toast.show(recorded ? `Review saved. ${ownerName} can see it` : `Review saved, but ${petName}'s Life Record wasn't updated.`);
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (!editing && review) {
    return (
      <Card style={styles.card} testID={`pet-review-${petId}`}>
        <Text style={styles.label}>{`Your review of ${petName}`}</Text>
        {review.chips.length > 0 ? <Text style={styles.body}>{review.chips.join(" · ")}</Text> : null}
        {review.note ? <Text style={styles.body}>{review.note}</Text> : null}
        <Text style={styles.muted}>{sharedLine(ownerName)}</Text>
        <TextButton label="Edit" onPress={startEditing} testID={`pet-review-edit-${petId}`} />
      </Card>
    );
  }
  if (!editing) {
    return (
      <Card style={styles.card} testID={`pet-review-${petId}`}>
        <Text style={styles.label}>{`How was ${petName}?`}</Text>
        <Button label={`Review ${petName}`} variant="secondary" onPress={startEditing} testID={`pet-review-start-${petId}`} />
      </Card>
    );
  }
  return (
    <Card style={styles.card} testID={`pet-review-${petId}`}>
      <Text style={styles.label}>{`How was ${petName}?`}</Text>
      <Text style={styles.muted}>{sharedLine(ownerName)}</Text>
      {chips === null ? (
        <Text style={styles.muted} testID={`pet-review-loading-${petId}`}>
          Finding chips…
        </Text>
      ) : (
        <ChipSuggestions
          chips={chips.map((c, i) => ({ id: String(i), kind: "episode", label: c, source: "custom", check: null, media_id: null }))}
          off={new Set(chips.flatMap((c, i) => (picked.includes(c) ? [] : [String(i)])))}
          onToggle={(id) => {
            const chip = chips[Number(id)];
            setPicked((prev) => (prev.includes(chip) ? prev.filter((x) => x !== chip) : [...prev, chip]));
          }}
          testIDPrefix={`pet-review-chip-${petId}`}
        />
      )}
      {noteOpen ? (
        <TextField
          label="A few words (optional)"
          value={note}
          maxLength={REVIEW_NOTE_MAX}
          multiline
          onChangeText={setNote}
          testID={`pet-review-note-${petId}`}
        />
      ) : (
        <TextButton label="+ Add a note" onPress={() => setNoteOpen(true)} testID={`pet-review-note-open-${petId}`} />
      )}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <View style={styles.actions}>
        <Button
          label={saving ? "Saving…" : "Save review"}
          disabled={saving || (picked.length === 0 && !note.trim())}
          onPress={() => void save()}
          testID={`pet-review-save-${petId}`}
        />
        <TextButton label="Cancel" onPress={() => setEditing(false)} testID={`pet-review-cancel-${petId}`} />
      </View>
    </Card>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    card: { gap: theme.spacing.sm },
    label: { fontSize: theme.fontSize.small, fontWeight: theme.fontWeight.semibold, color: theme.color.textMuted },
    body: { fontSize: theme.fontSize.body, color: theme.color.text },
    muted: { fontSize: theme.fontSize.small, color: theme.color.textMuted },
    error: { fontSize: theme.fontSize.small, color: theme.color.error },
    actions: { gap: theme.spacing.xs },
  });
