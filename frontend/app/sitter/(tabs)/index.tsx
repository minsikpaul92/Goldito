import { EmptyState } from "../../../components/ui/EmptyState";
import { Screen } from "../../../components/ui/Screen";

// Stub tab (phase-03): the real screen lands in Phase 03B / 06.
export default function SitterToday() {
  return (
    <Screen>
      <EmptyState
        emoji="🌤️"
        title="No bookings yet"
        message="Open your availability so owners can find you."
      />
    </Screen>
  );
}
