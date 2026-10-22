import { useCallback, useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { awardPetMedal, listBookingMedalPetIds } from "../../features/pets/medalApi";
import { useErrorDialog } from "../../providers/ErrorDialogProvider";
import { useThemedStyles } from "../../providers/ThemeProvider";
import { useToast } from "../../providers/ToastProvider";
import { Theme } from "../../theme/themes";
import { Button } from "../ui/Button";

type Props = { bookingId: string; pets: { id?: string; name: string }[]; ownerName: string };

/** After Returned (11.12): the sitter gives each pet of the stay a medal, once. The owner finds it under the pet room. */
export function MedalButtons({ bookingId, pets, ownerName }: Props) {
  const styles = useThemedStyles(makeStyles);
  const toast = useToast();
  const errorDialog = useErrorDialog();
  const [given, setGiven] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    void listBookingMedalPetIds(bookingId).then(setGiven);
  }, [bookingId]);
  useEffect(load, [load]);

  const give = async (petId: string, name: string) => {
    if (busy) return;
    setBusy(petId);
    try {
      await awardPetMedal(bookingId, petId);
      setGiven((prev) => [...prev, petId]);
      toast.show(`🏅 ${name} got a medal. ${ownerName} can see it`);
    } catch (e) {
      errorDialog.show({
        title: "Not given",
        message: e instanceof Error ? e.message : "Try again.",
        onRetry: () => void give(petId, name),
      });
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={styles.root} testID="medal-buttons">
      {pets.flatMap((pet) =>
        pet.id
          ? [
              given.includes(pet.id) ? (
                <Text key={pet.id} style={styles.done} testID={`medal-given-${pet.id}`}>{`🏅 ${pet.name} has a medal`}</Text>
              ) : (
                <Button
                  key={pet.id}
                  label={busy === pet.id ? "Saving…" : `🏅 Give ${pet.name} a medal`}
                  variant="secondary"
                  onPress={() => void give(pet.id as string, pet.name)}
                  disabled={busy !== null}
                  testID={`medal-give-${pet.id}`}
                />
              ),
            ]
          : [],
      )}
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    root: { gap: theme.spacing.sm },
    done: { fontSize: theme.fontSize.body, fontWeight: theme.fontWeight.semibold, color: theme.color.text },
  });
