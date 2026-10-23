import { router } from "expo-router";
import { StyleSheet, Text, View } from "react-native";

import { ActiveTripCard } from "../../../components/ActiveTripCard";
import { LatestCard } from "../../../components/home/LatestCard";
import { PetTile } from "../../../components/home/PetTile";
import { StatTiles } from "../../../components/home/StatTiles";
import { StayHero } from "../../../components/home/StayHero";
import { PetPage } from "../../../components/pet/PetPage";
import { Button } from "../../../components/ui/Button";
import { EmptyState } from "../../../components/ui/EmptyState";
import { LoadingView } from "../../../components/ui/LoadingView";
import { Pager } from "../../../components/ui/Pager";
import { Screen } from "../../../components/ui/Screen";
import { sectionTitleStyle } from "../../../components/ui/SectionTitle";
import { TextButton } from "../../../components/ui/TextButton";
import { useStayToday } from "../../../features/care/useStayToday";
import { useMyPets } from "../../../features/pets/useMyPets";
import { useThemedStyles } from "../../../providers/ThemeProvider";
import { tokens } from "../../../theme/tokens";
import { Theme } from "../../../theme/themes";

/**
 * Owner Home: two sides of a card, flipped with a button (#286). Today: the stay in progress (hero, today's numbers, the latest update) and my pets.
 * Pet: the 8-bit pet room of one pet, with the whole page for it (Add pet is on Today).
 */
export default function OwnerHome() {
  const styles = useThemedStyles(makeStyles);
  const { status, pets, error, reload } = useMyPets();
  const stay = useStayToday();
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

  // Pets two to a row (Figma "pets"); an odd last pet keeps its half width.
  const rows = Array.from({ length: Math.ceil(pets.length / 2) }, (_, i) => pets.slice(i * 2, i * 2 + 2));

  const today = (
    <Screen
      contentStyle={styles.list}
      footer={
        stay ? (
          // Brand green like the hero (Figma 1303:6024); the skin's `primary` is the darker ink.
          <Button
            label="See today's updates"
            onPress={() => router.push("/owner/history")}
            style={styles.updates}
            testID="see-updates"
          />
        ) : undefined
      }
    >
      <ActiveTripCard role="owner" />
      {stay ? (
        <>
          <StayHero stay={stay} />
          <StatTiles stay={stay} />
          <LatestCard stay={stay} />
        </>
      ) : null}
      <View style={styles.sectionHead}>
        <Text accessibilityRole="header" style={styles.section}>
          Your pets
        </Text>
        <TextButton label="+ Add pet" onPress={addPet} testID="add-pet" />
      </View>
      {rows.map((row, r) => (
        <View key={row[0].id} style={styles.petRow}>
          {row.map((pet, c) => (
            <PetTile key={pet.id} pet={pet} index={r * 2 + c} onPress={() => router.push(`/owner/pets/${pet.id}`)} />
          ))}
          {row.length === 1 ? <View style={styles.petSpacer} /> : null}
        </View>
      ))}
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
    // Figma body: 14 between blocks.
    list: {
      gap: 14,
    },
    sectionHead: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" },
    section: sectionTitleStyle(theme),
    petRow: { flexDirection: "row", gap: 10 },
    petSpacer: { flex: 1 },
    updates: { backgroundColor: tokens.color.primary, borderColor: tokens.color.primary },
  });
