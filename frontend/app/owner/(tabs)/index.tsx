import { router } from "expo-router";
import { StyleSheet, Text, View } from "react-native";

import { ActiveTripCard } from "../../../components/ActiveTripCard";
import { LiveUpdates } from "../../../components/LiveUpdates";
import { PetCard } from "../../../components/PetCard";
import { Button } from "../../../components/ui/Button";
import { Card } from "../../../components/ui/Card";
import { TextButton } from "../../../components/ui/TextButton";
import { EmptyState } from "../../../components/ui/EmptyState";
import { LoadingView } from "../../../components/ui/LoadingView";
import { Screen } from "../../../components/ui/Screen";
import { useInCare } from "../../../features/care/useInCare";
import { useMyPets } from "../../../features/pets/useMyPets";
import { useTheme, useThemedStyles } from "../../../providers/ThemeProvider";
import { Theme } from "../../../theme/themes";

/** Owner Home: live updates from the sitter (swipe to dismiss) and my pets. The pet room arrives later. */
export default function OwnerHome() {
  const styles = useThemedStyles(makeStyles);
  const blocks = useTheme().ui.blocks;
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

  // Expressive Home (Figma #147 frame): the stay block, your pets as tiles, and one pinned action. With nobody in care, that's finding a sitter.
  const petNames = pets.length === 2 ? `${pets[0].name} and ${pets[1].name}` : pets.length === 1 ? pets[0].name : "your pets";
  const anyInCare = Object.keys(inCare).length > 0;
  const tones = ["blush", "peach", "butter", "mint"] as const;

  return (
    <View style={styles.root}>
      <Screen contentStyle={styles.list}>
        <ActiveTripCard role="owner" />
        {blocks && !anyInCare ? (
          <Card tone="butter" style={styles.plan} testID="home-plan">
            <Text style={styles.planTitle}>No stay right now</Text>
            <Text style={styles.planBody}>{`When ${petNames} ${pets.length === 1 ? "is" : "are"} with a sitter, today's care shows up here.`}</Text>
          </Card>
        ) : null}
        <LiveUpdates />
        {blocks ? (
          <View style={styles.petsHead}>
            <Text accessibilityRole="header" style={styles.petsTitle}>Your pets</Text>
            <TextButton label="+ Add pet" onPress={addPet} testID="add-pet" />
          </View>
        ) : null}
        <View style={blocks ? styles.petGrid : styles.petList}>
          {pets.map((pet, i) => (
            <PetCard
              key={pet.id}
              pet={pet}
              tone={tones[i % tones.length]}
              layout={blocks ? "tile" : "row"}
              inCare={inCare[pet.id]}
              onPress={() => router.push(`/owner/pets/${pet.id}`)}
            />
          ))}
        </View>
      </Screen>
      <View style={styles.footer}>
        {blocks ? (
          // Figma Home: one pinned action for the moment.
          anyInCare ? (
            <Button label="See today's updates" onPress={() => router.push("/owner/diary")} testID="home-updates" />
          ) : (
            <Button label="Find a sitter" onPress={() => router.push("/owner/bookings")} testID="home-find-sitter" />
          )
        ) : (
          <Button label="Add pet" onPress={addPet} testID="add-pet" />
        )}
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
    petGrid: { flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.sm },
    petList: { gap: theme.spacing.md },
    plan: { gap: theme.spacing.sm },
    planTitle: {
      fontSize: 20,
      color: theme.color.text,
      ...(theme.fontFamily.display ? { fontFamily: theme.fontFamily.display } : { fontWeight: theme.fontWeight.bold }),
    },
    planBody: { fontSize: theme.fontSize.body, color: theme.color.text, marginBottom: theme.spacing.xs },
    petsHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: theme.spacing.xs },
    petsTitle: {
      fontSize: 20,
      color: theme.color.text,
      ...(theme.fontFamily.display ? { fontFamily: theme.fontFamily.display } : { fontWeight: theme.fontWeight.bold }),
    },
    footer: {
      padding: theme.spacing.md,
      maxWidth: 480,
      width: "100%",
      alignSelf: "center",
    },
  });
