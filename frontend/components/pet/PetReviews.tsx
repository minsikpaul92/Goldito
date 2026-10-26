import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { PetReview, listPetReviews } from "../../features/pets/reviewApi";
import { formatDay, isoToZoned } from "../../features/schedule/dates";
import { useThemedStyles } from "../../providers/ThemeProvider";
import { Theme } from "../../theme/themes";

const dayOf = (iso: string) => isoToZoned(iso).day;

/** "Oct 5", or "Oct 5 to Oct 7" for a longer stay. */
function stayLabel(r: PetReview): string {
  const from = dayOf(r.stayFrom ?? r.createdAt);
  const to = dayOf(r.stayTo ?? r.createdAt);
  return from === to ? formatDay(from) : `${formatDay(from)} to ${formatDay(to)}`;
}

type Props = {
  petId: string;
  /** Leaves out this stay's review (the sitter sees it in their own card on that booking). */
  excludeBookingId?: string;
};

/** What sitters said about this pet after their stays (#407), newest first; nothing at all while there are none. */
export function PetReviews({ petId, excludeBookingId }: Props) {
  const styles = useThemedStyles(makeStyles);
  const [reviews, setReviews] = useState<PetReview[]>([]);

  useEffect(() => {
    let live = true;
    setReviews([]);
    void listPetReviews(petId)
      .then((list) => live && setReviews(list.filter((r) => r.bookingId !== excludeBookingId)))
      .catch(() => undefined); // A bonus under the pet, like the medals.
    return () => {
      live = false;
    };
  }, [petId, excludeBookingId]);

  if (reviews.length === 0) return null;
  return (
    <View style={styles.root} testID={`pet-reviews-${petId}`}>
      {reviews.map((r) => (
        <View key={r.id} style={styles.row} testID={`pet-review-row-${r.id}`}>
          <Text style={styles.title}>
            {r.sitterName}
            <Text style={styles.when}>{` · ${stayLabel(r)}`}</Text>
          </Text>
          {r.chips.length > 0 ? <Text style={styles.body}>{r.chips.join(" · ")}</Text> : null}
          {r.note ? <Text style={styles.body}>{r.note}</Text> : null}
        </View>
      ))}
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    root: { gap: theme.spacing.sm },
    row: {
      gap: theme.spacing.xs,
      padding: theme.spacing.md,
      borderRadius: theme.radius.lg,
      borderWidth: 1,
      borderColor: theme.color.border,
      backgroundColor: theme.color.surface,
    },
    title: { fontSize: theme.fontSize.body, fontWeight: theme.fontWeight.semibold, color: theme.color.text },
    when: { fontSize: theme.fontSize.small, fontWeight: theme.fontWeight.regular, color: theme.color.textMuted },
    body: { fontSize: theme.fontSize.body, color: theme.color.text },
  });
