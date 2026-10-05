import { router } from "expo-router";
import { StyleSheet, View } from "react-native";

import { LiveUpdates } from "../../../components/LiveUpdates";
import { PetCard } from "../../../components/PetCard";
import { Button } from "../../../components/ui/Button";
import { EmptyState } from "../../../components/ui/EmptyState";
import { LoadingView } from "../../../components/ui/LoadingView";
import { Screen } from "../../../components/ui/Screen";
import { useMyPets } from "../../../features/pets/useMyPets";
import { useThemedStyles } from "../../../providers/ThemeProvider";
import { Theme } from "../../../theme/themes";

/** Owner Home: live updates from the sitter (swipe to dismiss) and my pets. The pet room arrives later. */
export default function OwnerHome() {
  const styles = useThemedStyles(makeStyles);
  const { status, pets, error, reload } = useMyPets();
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

  return (
    <View style={styles.root}>
      <Screen contentStyle={styles.list}>
        <LiveUpdates />
        {pets.map((pet) => (
          <PetCard key={pet.id} pet={pet} onPress={() => router.push(`/owner/pets/${pet.id}`)} />
        ))}
      </Screen>
      <View style={styles.footer}>
        <Button label="Add pet" onPress={addPet} />
      </View>
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
    footer: {
      padding: theme.spacing.md,
      maxWidth: 480,
      width: "100%",
      alignSelf: "center",
    },
  });
