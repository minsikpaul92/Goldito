import { router, useLocalSearchParams } from "expo-router";
import { StyleSheet, View } from "react-native";

import { Art } from "../../../components/art/Art";
import { QuickCheckIn } from "../../../components/QuickCheckIn";
import { BackLink } from "../../../components/ui/BackLink";
import { EmptyState } from "../../../components/ui/EmptyState";
import { LoadingView } from "../../../components/ui/LoadingView";
import { Screen } from "../../../components/ui/Screen";
import { ScreenHeader } from "../../../components/ui/ScreenHeader";
import { useCaringPets } from "../../../features/care/useCaringPets";
import { useThemedStyles } from "../../../providers/ThemeProvider";
import { Theme } from "../../../theme/themes";

const goBack = () => (router.canGoBack() ? router.back() : router.replace("/sitter"));

/** One pet's 5-second check-in (opened from the pet chips on Home); the check-in is the whole screen, with its dock. */
export default function SitterCheckin() {
  const styles = useThemedStyles(makeStyles);
  const { petId } = useLocalSearchParams<{ petId: string }>();
  const { state, reload } = useCaringPets();
  if (state.status === "loading") return <LoadingView />;
  const pet = state.status === "ready" ? state.pets.find((p) => p.id === petId) : undefined;
  if (!pet) {
    return (
      <Screen>
        <BackLink onPress={goBack} testID="checkin-back" />
        <EmptyState
          icon="paw"
          title={state.status === "error" ? "Couldn't load this pet" : "Not in your care right now"}
          message={state.status === "error" ? state.message : "Check-ins open while the stay is on."}
          action={state.status === "error" ? { label: "Try again", onPress: () => void reload() } : undefined}
        />
      </Screen>
    );
  }
  return (
    <QuickCheckIn
      pet={pet}
      onPhotos={() => router.push(`/sitter/feed/${pet.id}`)}
      header={
        <>
          <BackLink onPress={goBack} testID="checkin-back" />
          <ScreenHeader
            title={`${pet.name} · Check-in`}
            subtitle="Tap what happened, then Send"
            right={
              <View style={styles.face} aria-hidden>
                <Art name={pet.species === "cat" ? "owner/pet-cat" : "owner/pet-dog"} size={36} />
              </View>
            }
          />
        </>
      }
    />
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    face: {
      width: 48,
      height: 48,
      borderRadius: 24,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.color.surface,
    },
  });
