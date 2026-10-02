import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { SitterCard } from "../../../components/SitterCard";
import { EmptyState } from "../../../components/ui/EmptyState";
import { LoadingView } from "../../../components/ui/LoadingView";
import { Screen } from "../../../components/ui/Screen";
import { MySitter, listMySitters } from "../../../features/sitters/sitterApi";
import { useThemedStyles } from "../../../providers/ThemeProvider";
import { Theme } from "../../../theme/themes";

type State =
  | { status: "loading" }
  | { status: "ready"; sitters: MySitter[] }
  | { status: "error"; message: string };

/**
 * Owner Bookings tab. 3B.2: "Your sitters" (sitters you have booked before) → their profile
 * and month schedule. The booking list and Book care land in 3B.3.
 */
export default function OwnerBookings() {
  const styles = useThemedStyles(makeStyles);
  const [state, setState] = useState<State>({ status: "loading" });

  const load = useCallback(async () => {
    try {
      setState({ status: "ready", sitters: await listMySitters() });
    } catch (error) {
      setState({ status: "error", message: (error as Error).message });
    }
  }, []);

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
          emoji="📅"
          title="Couldn't load your sitters"
          message={state.message}
          action={{ label: "Try again", onPress: () => void load() }}
        />
      </Screen>
    );
  }

  if (state.sitters.length === 0) {
    return (
      <Screen>
        <EmptyState
          emoji="📅"
          title="No bookings yet"
          message="Book a sitter for your next trip — your requests and stays will show here."
        />
      </Screen>
    );
  }

  return (
    <Screen contentStyle={styles.list}>
      <View style={styles.section}>
        <Text accessibilityRole="header" style={styles.heading}>
          Your sitters
        </Text>
        <Text style={styles.hint}>Check their schedules before you plan a trip.</Text>
      </View>
      {state.sitters.map((sitter) => (
        <SitterCard
          key={sitter.id}
          sitter={sitter}
          note={sitter.bookingCount === 1 ? "1 booking with you" : `${sitter.bookingCount} bookings with you`}
          onPress={() => router.push(`/owner/sitters/${sitter.id}`)}
        />
      ))}
    </Screen>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    list: {
      gap: theme.spacing.md,
    },
    section: {
      gap: theme.spacing.xs,
    },
    heading: {
      fontSize: theme.fontSize.body,
      fontWeight: "600",
      color: theme.color.text,
    },
    hint: {
      fontSize: theme.fontSize.small,
      color: theme.color.textMuted,
    },
  });
