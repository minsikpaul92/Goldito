import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Card } from "../../../components/ui/Card";
import { EmptyState } from "../../../components/ui/EmptyState";
import { LoadingView } from "../../../components/ui/LoadingView";
import { Screen } from "../../../components/ui/Screen";
import { caringPetsFromBookings } from "../../../features/feed/caringPets";
import { SPECIES_EMOJI } from "../../../features/pets/petFormat";
import { listSitterBookings } from "../../../lib/bookings";
import { useSession } from "../../../providers/SessionProvider";
import { useThemedStyles } from "../../../providers/ThemeProvider";
import { Theme } from "../../../theme/themes";

type State =
  | { status: "loading" }
  | { status: "ready" }
  | { status: "error"; message: string };

/**
 * Sitter Feed tab (D47b / phase-05): pets in care → `/sitter/pets/[petId]` (+ Photo FAB).
 */
export default function SitterFeed() {
  const styles = useThemedStyles(makeStyles);
  const { profile } = useSession();
  const sitterId = profile?.id;
  const [state, setState] = useState<State>({ status: "loading" });
  const [pets, setPets] = useState(() => caringPetsFromBookings([]));

  const load = useCallback(async () => {
    if (!sitterId) return;
    try {
      const bookings = await listSitterBookings(sitterId);
      setPets(caringPetsFromBookings(bookings));
      setState({ status: "ready" });
    } catch (error) {
      setState({ status: "error", message: (error as Error).message });
    }
  }, [sitterId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (state.status === "loading") return <LoadingView />;
  if (state.status === "error") {
    return (
      <Screen>
        <EmptyState
          emoji="📸"
          title="Couldn't load pets"
          message={state.message}
          action={{ label: "Try again", onPress: () => void load() }}
        />
      </Screen>
    );
  }

  if (pets.length === 0) {
    return (
      <Screen>
        <EmptyState
          emoji="📸"
          title="Share a moment"
          message="When you're caring for a pet, open them here to share photos with the owner."
        />
      </Screen>
    );
  }

  return (
    <Screen contentStyle={styles.content}>
      <Text style={styles.hint}>Tap a pet to share photos — they show up in the owner's Feed.</Text>
      {pets.map((pet) => (
        <Pressable
          key={pet.id}
          accessibilityRole="button"
          accessibilityLabel={`${pet.name}, share photos`}
          onPress={() => router.push(`/sitter/pets/${pet.id}`)}
          style={({ pressed }) => pressed && styles.pressed}
          testID={`sitter-feed-pet-${pet.id}`}
        >
          <Card style={styles.card}>
            <Text style={styles.title}>
              {SPECIES_EMOJI[pet.species]} {pet.name}
            </Text>
            <Text style={styles.muted}>With {pet.ownerName} · + Photo</Text>
          </Card>
        </Pressable>
      ))}
    </Screen>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    content: {
      gap: theme.spacing.sm,
    },
    hint: {
      fontSize: theme.fontSize.small,
      color: theme.color.textMuted,
      marginBottom: theme.spacing.xs,
    },
    card: {
      gap: theme.spacing.xs,
    },
    title: {
      fontSize: theme.fontSize.body,
      fontWeight: "600",
      color: theme.color.text,
    },
    muted: {
      fontSize: theme.fontSize.small,
      color: theme.color.textMuted,
    },
    pressed: {
      opacity: 0.85,
    },
  });
