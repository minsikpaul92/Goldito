import { router } from "expo-router";
import { StyleSheet, View } from "react-native";

import { ActiveTripCard } from "../../../components/ActiveTripCard";
import { LiveUpdates } from "../../../components/LiveUpdates";
import { PetCard } from "../../../components/PetCard";
import { PetPage } from "../../../components/pet/PetPage";
import { Button } from "../../../components/ui/Button";
import { EmptyState } from "../../../components/ui/EmptyState";
import { LoadingView } from "../../../components/ui/LoadingView";
import { Pager } from "../../../components/ui/Pager";
import { Screen } from "../../../components/ui/Screen";
import { useInCare } from "../../../features/care/useInCare";
import { useMyPets } from "../../../features/pets/useMyPets";
import { useThemedStyles } from "../../../providers/ThemeProvider";
import { Theme } from "../../../theme/themes";

/**
 * Owner Home: two swipe pages (11.12). Today: live updates from the sitter (swipe to dismiss) and my pets.
 * Pet: the 8-bit pet room of one pet, with the whole page for it (Add pet is on Today).
 */
export default function OwnerHome() {
  const styles = useThemedStyles(makeStyles);
  const { status, pets, error, reload } = useMyPets();
  const inCare = useInCare();
  const addPet = () => router.push("/owner/pets/new");

  if (status === "loading" && pets.length === 0) return <LoadingView />;

  if (status === "error" && pets.length === 0) {
    return (
      <Screen>
        <EmptyState
          emoji="🐾"
          title="Couldn't load your pets"
          message={error ?? "Check your connection and try again."}
          action={{ label: "Try again", onPress: () => void reload() }}
        />
      </Screen>
    );
  }

  if (pets.length === 0) {
    return (
      <Screen>
        <EmptyState
          emoji="🐶"
          title="No pets yet"
          message="Add your dog or cat to start getting care updates."
          action={{ label: "Add pet", onPress: addPet }}
        />
      </Screen>
    );
  }

  const today = (
    <Screen contentStyle={styles.list}>
      <ActiveTripCard role="owner" />
      <LiveUpdates />
      {pets.map((pet) => (
        <PetCard key={pet.id} pet={pet} inCare={inCare[pet.id]} onPress={() => router.push(`/owner/pets/${pet.id}`)} />
      ))}
      <Button label="Add pet" onPress={addPet} testID="add-pet" />
    </Screen>
  );

  return (
    <View style={styles.root}>
      <Pager
        testID="home-pager"
        pages={[
          { label: "Today", content: today },
          { label: "Pet", content: <PetPage pets={pets} onChanged={() => void reload()} /> },
        ]}
      />
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: theme.color.background,
    },
    list: {
      gap: theme.spacing.md,
    },
  });
