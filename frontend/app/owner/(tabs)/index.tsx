import { router } from "expo-router";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { ActiveTripCard } from "../../../components/ActiveTripCard";
import { FeedPetPicker } from "../../../components/FeedPetPicker";
import { BookingTicket } from "../../../components/BookingTicket";
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
import { useHomeStay } from "../../../features/bookings/useHomeStay";
import { useStayToday } from "../../../features/care/useStayToday";
import { usePetFaces } from "../../../features/feed/usePetFaces";
import { useMyPets } from "../../../features/pets/useMyPets";
import { useThemedStyles } from "../../../providers/ThemeProvider";
import { tokens } from "../../../theme/tokens";
import { Theme } from "../../../theme/themes";

/**
 * Owner Home: two sides of a card, flipped with a button (#286). Today: the stay in progress (hero, the stay's ticket,
 * today's numbers, the latest update) and my pets. The ticket moved here from the Bookings tab (Oct 25); with no stay
 * in care it shows the next paid one.
 * Pet room: the 8-bit pet room of one pet, with the whole page for it (Add pet is on Today). The two sides are underline
 * tabs, and on Pet room the Moments pet chip at the end of the row picks whose room it is (Mook, Oct 27).
 */
export default function OwnerHome() {
  const styles = useThemedStyles(makeStyles);
  const { status, pets, error, reload } = useMyPets();
  const stay = useStayToday();
  const booking = useHomeStay();
  const addPet = () => router.push("/owner-onboarding?add=1");
  const [petId, setPetId] = useState<string>();
  const faces = usePetFaces(pets.map((p) => p.id));

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
    <Screen contentStyle={styles.list}>
      <ActiveTripCard role="owner" />
      {stay ? <StayHero stay={stay} /> : null}
      {booking ? (
        <BookingTicket booking={booking} viewer="owner" onPress={() => router.push(`/owner/bookings/${booking.id}`)} testID="home-stay-ticket" />
      ) : null}
      {stay ? (
        <>
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
      {stay ? (
        // The last block of the page, scrolls with the rest; brand green like the hero (Figma 1303:6024).
        <Button label="See today's updates" onPress={() => router.push("/owner/history")} style={styles.updates} testID="see-updates" />
      ) : null}
    </Screen>
  );

  return (
    <View style={styles.root}>
      <Pager
        testID="home-pager"
        pages={[
          { label: "Today", content: today },
          {
            label: "Pet room",
            content: <PetPage pets={pets} petId={petId} onChanged={() => void reload()} />,
            right: (
              <FeedPetPicker
                groups={[{ key: "mine", pets: pets.map((p) => ({ id: p.id, name: p.name, species: p.species })) }]}
                allPets={[]}
                value={petId ?? pets[0].id}
                onChange={setPetId}
                faces={faces}
                testID="pet-switch"
              />
            ),
          },
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
