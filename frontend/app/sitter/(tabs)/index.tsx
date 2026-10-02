import { router } from "expo-router";

import { EmptyState } from "../../../components/ui/EmptyState";
import { Screen } from "../../../components/ui/Screen";

// Stub tab (phase-03): Now caring / Today / Upcoming land in 3B.8, check-ins in Phase 06.
export default function SitterToday() {
  return (
    <Screen>
      <EmptyState
        emoji="🌤️"
        title="No bookings yet"
        message="Open your schedule so owners can find you."
        action={{ label: "Open your schedule", onPress: () => router.push("/sitter/schedule") }}
      />
    </Screen>
  );
}
