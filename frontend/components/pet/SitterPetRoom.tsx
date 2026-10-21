import { router } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { logCareCheckin } from "../../features/care/careApi";
import { PET_ACTIONS, petActionsFor } from "../../features/care/checkinOptions";
import type { CaringPet } from "../../features/feed/caringPets";
import { SPECIES_EMOJI } from "../../features/pets/petFormat";
import { usePetLook } from "../../features/pets/usePetLook";
import { useErrorDialog } from "../../providers/ErrorDialogProvider";
import { useThemedStyles } from "../../providers/ThemeProvider";
import { useToast } from "../../providers/ToastProvider";
import { Theme } from "../../theme/themes";
import { PetRoom } from "./PetRoom";

/**
 * The pets in care on the sitter's Home (11.12): the same pixel pet the owner sees, one at a time (name chips switch
 * when there are several), and four taps under it (feed, walk, poop, nap). Each tap is a care check-in with a default
 * value, so the owner is told and the pet reacts right away. Tapping the pet opens the full check-in (memo, photo).
 */
export function SitterPetRoom({ pets }: { pets: CaringPet[] }) {
  const styles = useThemedStyles(makeStyles);
  const [selected, setSelected] = useState(pets[0]?.id);
  const pet = pets.find((p) => p.id === selected) ?? pets[0];
  if (!pet) return null;

  return (
    <View style={styles.root} testID="today-caring">
      {pets.length > 1 ? (
        <View style={styles.chips}>
          {pets.map((p) => (
            <Pressable
              key={p.id}
              accessibilityRole="button"
              accessibilityState={{ selected: p.id === pet.id }}
              hitSlop={4}
              onPress={() => setSelected(p.id)}
              style={({ pressed }) => [styles.chip, p.id === pet.id && styles.chipOn, pressed && styles.pressed]}
              testID={`caring-pet-${p.id}`}
            >
              <Text style={[styles.chipText, p.id === pet.id && styles.chipTextOn]}>{`${SPECIES_EMOJI[p.species]} ${p.name}`}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      <PetTaps key={pet.id} pet={pet} />
    </View>
  );
}

function PetTaps({ pet }: { pet: CaringPet }) {
  const styles = useThemedStyles(makeStyles);
  const toast = useToast();
  const errorDialog = useErrorDialog();
  const { coat, breed, weightKg, head } = usePetLook(pet.id);
  const [reloadKey, setReloadKey] = useState(0);
  const [sending, setSending] = useState<string | null>(null);

  const send = async (action: (typeof PET_ACTIONS)[number]) => {
    if (sending) return;
    setSending(action.key);
    try {
      await logCareCheckin({ petId: pet.id, kind: action.kind, value: action.value, note: null, mediaId: null });
      toast.show(`Sent ✅ ${pet.ownerName} was told`);
      setReloadKey((k) => k + 1);
    } catch (e) {
      errorDialog.show({
        title: "Not sent",
        message: e instanceof Error ? e.message : "Try again.",
        onRetry: () => void send(action),
      });
    } finally {
      setSending(null);
    }
  };

  return (
    <PetRoom
      pet={{ id: pet.id, name: pet.name, species: pet.species, coat, breed, weightKg, head }}
      reloadKey={reloadKey}
      onPress={() => router.push(`/sitter/checkin/${pet.id}`)}
      compact
    >
      <View style={styles.actions}>
        {petActionsFor(pet.species).map((action) => (
          <Pressable
            key={action.key}
            accessibilityRole="button"
            accessibilityLabel={`${action.label} ${pet.name}`}
            disabled={sending !== null}
            onPress={() => void send(action)}
            style={({ pressed }) => [styles.action, pressed && styles.pressed, sending !== null && styles.disabled]}
            testID={`pet-action-${pet.id}-${action.key}`}
          >
            <Text style={styles.emoji}>{action.emoji}</Text>
            <Text style={styles.label}>{action.label}</Text>
          </Pressable>
        ))}
      </View>
    </PetRoom>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    root: { gap: theme.spacing.xs },
    chips: { flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.xs },
    chip: {
      minHeight: 36,
      justifyContent: "center",
      paddingHorizontal: theme.spacing.md,
      borderRadius: theme.radius.pill,
      borderWidth: 1,
      borderColor: theme.color.primary,
      backgroundColor: theme.color.accent,
    },
    chipOn: { backgroundColor: theme.color.primary },
    chipText: { fontSize: theme.fontSize.body, fontWeight: theme.fontWeight.semibold, color: theme.color.primary },
    chipTextOn: { color: theme.color.primaryText },
    actions: { flexDirection: "row", gap: theme.spacing.sm },
    action: {
      flex: 1,
      minHeight: 40,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: theme.radius.md,
      backgroundColor: theme.color.surface,
    },
    emoji: { fontSize: 18 },
    label: { fontSize: theme.fontSize.caption, fontWeight: theme.fontWeight.semibold, color: theme.color.text },
    pressed: { opacity: theme.opacity.pressed },
    disabled: { opacity: theme.opacity.disabled },
  });
