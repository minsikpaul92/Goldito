import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { StyleSheet } from "react-native";

import { EmptyState } from "../../components/ui/EmptyState";
import { LoadingView } from "../../components/ui/LoadingView";
import { Screen } from "../../components/ui/Screen";
import { useThemedStyles } from "../../providers/ThemeProvider";
import { CheckRow } from "./CheckRow";
import { PetOption, Role, SnapPets } from "./SnapPets";
import { SafetyCheck, listRecentChecksForPets } from "./treatApi";

/** "See all" on the Snap tab: this pet's treat checks, newest first (the last 20). A row opens that check. */
export function ChecksScreen({ role }: { role: Role }) {
  return <SnapPets role={role}>{(pets) => (pets.status === "ready" ? <List role={role} pets={pets.pets} /> : <LoadingView />)}</SnapPets>;
}

function List({ role, pets }: { role: Role; pets: PetOption[] }) {
  const styles = useThemedStyles(makeStyles);
  const { pet: petParam } = useLocalSearchParams<{ pet?: string }>();
  const pet = pets.find((p) => p.id === petParam) ?? pets[0] ?? null;
  const [checks, setChecks] = useState<SafetyCheck[] | null>(null);

  useEffect(() => {
    if (!pet) return;
    let live = true;
    listRecentChecksForPets([pet.id], 20)
      .then((list) => live && setChecks(list))
      .catch(() => live && setChecks([]));
    return () => {
      live = false;
    };
  }, [pet]);

  if (!pet || checks === null) return pet ? <LoadingView /> : <Screen><EmptyState emoji="🐾" title="No pet yet" message="Add a pet on Home first." /></Screen>;
  return (
    <Screen contentStyle={styles.content} testID="snap-checks">
      {checks.length === 0 ? (
        <EmptyState emoji="🏷️" title="No checks yet" message={`Treat checks for ${pet.name} show up here.`} />
      ) : (
        checks.map((c) => (
          <CheckRow key={c.id} check={c} petName={pet.name} onPress={() => router.push(`/${role}/snap/treat?check=${c.id}`)} testID="snap-checks-row" />
        ))
      )}
    </Screen>
  );
}

const makeStyles = () => StyleSheet.create({ content: { gap: 10 } });
