import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";
import { StyleSheet, Text, View } from "react-native";

import { usePetStay } from "../features/care/usePetStay";
import { PetCaution, addPetCaution, deletePetCaution, listPetCautions } from "../features/care/careApi";
import { useErrorDialog } from "../providers/ErrorDialogProvider";
import { useThemedStyles } from "../providers/ThemeProvider";
import { Theme } from "../theme/themes";
import type { Pet } from "../types/db";
import { Button } from "./ui/Button";
import { Chip } from "./ui/Chip";
import { TextField } from "./ui/TextField";

const MAX = 100;

/**
 * The owner's Heads-ups for a pet — what the sitter sees at the top of Home and on booking requests.
 * They come from a care request, and can be removed or added here.
 */
export function HeadsUpSection({ pet, userId }: { pet: Pick<Pet, "id" | "name">; userId: string }) {
  const styles = useThemedStyles(makeStyles);
  const errorDialog = useErrorDialog();
  const [items, setItems] = useState<PetCaution[] | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const { state: stayState } = usePetStay(pet.id);
  const stay = stayState.status === "ready" ? stayState.stay : null;

  const load = useCallback(async () => {
    try {
      setItems(await listPetCautions([pet.id]));
    } catch {
      setItems((prev) => prev ?? []);
    }
  }, [pet.id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const add = async () => {
    const clean = text.trim();
    if (!clean || busy) return;
    if ((items ?? []).some((i) => i.text.toLowerCase() === clean.toLowerCase())) {
      setText("");
      return;
    }
    setBusy(true);
    try {
      await addPetCaution(pet.id, userId, clean);
      setText("");
      await load();
    } catch (error) {
      errorDialog.show({ title: "Heads-up not added", message: (error as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const remove = async (item: PetCaution) => {
    setItems((prev) => (prev ?? []).filter((i) => i.id !== item.id));
    try {
      await deletePetCaution(item.id);
    } catch (error) {
      void load();
      errorDialog.show({ title: "Heads-up not removed", message: (error as Error).message });
    }
  };

  return (
    <View style={styles.section} testID="heads-up">
      <Text accessibilityRole="header" style={styles.heading}>
        Heads-up
      </Text>
      <Text style={styles.hint}>{`What ${pet.name}'s sitter should watch out for — shown at the top of their Home.`}</Text>
      {items != null && items.length === 0 ? (
        <Text style={styles.muted} testID="heads-up-empty">
          {stay ? "None yet. Write a care request to add one." : "None yet. Write a care request, or add one below."}
        </Text>
      ) : null}
      <View style={styles.chips}>
        {(items ?? []).map((i) => (
          <Chip key={i.id} label={i.text} onRemove={() => void remove(i)} testID={`heads-up-item-${i.id}`} />
        ))}
      </View>
      {stay ? (
        <Text style={styles.hint} testID="heads-up-locked">
          {`A stay is on — new Heads-ups go through a care request, and ${stay.sitterName} approves them.`}
        </Text>
      ) : (
        <>
          <TextField
            label="Add a Heads-up"
            value={text}
            maxLength={MAX}
            placeholder="e.g. Doesn't like men in hats"
            onChangeText={setText}
            onSubmitEditing={() => void add()}
            testID="heads-up-input"
          />
          <Button label="Add Heads-up" variant="secondary" disabled={!text.trim() || busy} onPress={() => void add()} testID="heads-up-add" />
        </>
      )}
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    section: { marginTop: theme.spacing.lg, gap: theme.spacing.sm },
    heading: { fontSize: theme.fontSize.title, fontWeight: "700", color: theme.color.text },
    hint: { fontSize: theme.fontSize.small, color: theme.color.textMuted },
    muted: { fontSize: theme.fontSize.body, color: theme.color.textMuted },
    chips: { flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.xs },
  });
