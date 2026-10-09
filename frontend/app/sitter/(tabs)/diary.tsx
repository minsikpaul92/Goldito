import { useCallback, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { EmptyState } from "../../../components/ui/EmptyState";
import { LoadingView } from "../../../components/ui/LoadingView";
import { Screen } from "../../../components/ui/Screen";
import { ReportComposer, type ReportStatus } from "../../../components/ReportComposer";
import { useCaringPets } from "../../../features/care/useCaringPets";
import { useThemedStyles } from "../../../providers/ThemeProvider";
import { Theme } from "../../../theme/themes";

const STATUS_LABEL: Record<NonNullable<ReportStatus>, string> = { sent: "Sent ✓", draft: "Draft" };

/**
 * Sitter Diary (D47b): the evening note — chips from the day, short lines of the sitter's own, a preview the
 * sitter edits and approves (phase-07 7.3). With more than one pet in care the sitter picks the pet first and
 * writes for that pet only (FB-19); each pet's chips and lines stay while switching.
 */
export default function SitterDiary() {
  const styles = useThemedStyles(makeStyles);
  const { state, reload } = useCaringPets();
  const [selected, setSelected] = useState<string | null>(null);
  const [statuses, setStatuses] = useState<Record<string, ReportStatus>>({});
  const onStatus = useCallback(
    (petId: string) => (status: ReportStatus) => setStatuses((prev) => (prev[petId] === status ? prev : { ...prev, [petId]: status })),
    [],
  );

  if (state.status === "loading") return <LoadingView />;
  if (state.status === "error") {
    return (
      <Screen>
        <EmptyState
          emoji="📔"
          title="Couldn't load your pets"
          message={state.message}
          action={{ label: "Try again", onPress: () => void reload() }}
        />
      </Screen>
    );
  }
  if (state.pets.length === 0) {
    return (
      <Screen>
        <EmptyState
          emoji="📔"
          title="Diary"
          message="When you're caring for a pet, you can write and send the evening note from here."
        />
      </Screen>
    );
  }
  const current = state.pets.find((p) => p.id === selected) ?? state.pets[0];
  return (
    <Screen testID="sitter-diary-screen" contentStyle={{ gap: 12 }}>
      {state.pets.length > 1 ? (
        <View style={styles.picker} accessibilityLabel="Whose report">
          {state.pets.map((pet) => {
            const on = pet.id === current.id;
            const status = statuses[pet.id];
            return (
              <Pressable
                key={pet.id}
                accessibilityRole="button"
                accessibilityLabel={`${pet.name}${status ? `, ${STATUS_LABEL[status]}` : ""}`}
                aria-pressed={on}
                onPress={() => setSelected(pet.id)}
                style={({ pressed }) => [styles.pet, on && styles.petOn, pressed && styles.pressed]}
                testID={`diary-pet-${pet.id}`}
              >
                <Text style={[styles.petName, on && styles.petNameOn]}>{pet.name}</Text>
                {status ? <Text style={[styles.status, on && styles.petNameOn]}>{STATUS_LABEL[status]}</Text> : null}
              </Pressable>
            );
          })}
        </View>
      ) : null}
      {state.pets.map((pet) => (
        // Every pet's composer stays mounted (its chips, lines and draft survive switching); only the picked one shows.
        <View key={pet.id} style={pet.id === current.id ? undefined : styles.hidden}>
          <ReportComposer pet={pet} onStatus={onStatus(pet.id)} />
        </View>
      ))}
    </Screen>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    picker: { flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.xs },
    pet: {
      minHeight: 44,
      paddingHorizontal: theme.spacing.md,
      borderRadius: 22,
      borderWidth: 1,
      borderColor: theme.color.border,
      backgroundColor: theme.color.surface,
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.xs,
    },
    petOn: { borderColor: theme.color.primary, backgroundColor: theme.color.accent },
    pressed: { opacity: 0.6 },
    petName: { fontSize: theme.fontSize.body, fontWeight: "700", color: theme.color.textMuted },
    petNameOn: { color: theme.color.primary },
    status: { fontSize: theme.fontSize.small, color: theme.color.textMuted },
    hidden: { display: "none" },
  });
