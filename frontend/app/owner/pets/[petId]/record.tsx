import { Stack, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useState } from "react";
import { StyleSheet, Text } from "react-native";

import { LifeRecordCard } from "../../../../components/LifeRecordCard";
import { EmptyState } from "../../../../components/ui/EmptyState";
import { LoadingView } from "../../../../components/ui/LoadingView";
import { Screen } from "../../../../components/ui/Screen";
import { LifeRecord, listLifeRecords } from "../../../../features/completion/completionApi";
import { getPet } from "../../../../features/pets/petApi";
import { useThemedStyles } from "../../../../providers/ThemeProvider";
import { Theme } from "../../../../theme/themes";

type State =
  | { status: "loading" }
  | { status: "ready"; name: string; records: LifeRecord[] }
  | { status: "error"; message: string };

/** A pet's Life Record (phase-07C 7C.5): the newest stay's notes on top, earlier stays below. Read-only. */
export default function PetLifeRecord() {
  const styles = useThemedStyles(makeStyles);
  const { petId } = useLocalSearchParams<{ petId: string }>();
  const [state, setState] = useState<State>({ status: "loading" });

  const load = useCallback(async () => {
    try {
      const [pet, records] = await Promise.all([getPet(petId), listLifeRecords(petId)]);
      setState({ status: "ready", name: pet?.name ?? "Your pet", records });
    } catch (e) {
      setState({ status: "error", message: (e as Error).message });
    }
  }, [petId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (state.status === "loading") return <LoadingView />;
  if (state.status === "error") {
    return (
      <Screen>
        <EmptyState emoji="📖" title="Couldn't load the Life Record" message={state.message} action={{ label: "Try again", onPress: () => void load() }} />
      </Screen>
    );
  }
  const [latest, ...earlier] = state.records;
  if (!latest) {
    return (
      <Screen>
        <Stack.Screen options={{ title: `${state.name} · Life Record` }} />
        <EmptyState
          emoji="📖"
          title="No Life Record yet"
          message={`After ${state.name}'s first stay, what the sitter learned shows up here — and travels to the next sitter.`}
        />
      </Screen>
    );
  }
  return (
    <Screen testID="life-record" contentStyle={styles.content}>
      <Stack.Screen options={{ title: `${state.name} · Life Record` }} />
      <LifeRecordCard record={latest} petName={state.name} testID="record-latest" />
      {earlier.length > 0 ? (
        <>
          <Text accessibilityRole="header" style={styles.heading}>
            Earlier stays
          </Text>
          {earlier.map((r) => (
            <LifeRecordCard key={r.id} record={r} petName={state.name} testID={`record-${r.id}`} />
          ))}
        </>
      ) : null}
    </Screen>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    content: { gap: theme.spacing.md },
    heading: { fontSize: theme.fontSize.body, fontWeight: "700", color: theme.color.text },
  });
