import { EmptyState } from "../../components/ui/EmptyState";
import { Screen } from "../../components/ui/Screen";

// Stub tab (phase-03): the real screen lands in Phase 06.
export default function OwnerCare() {
  return (
    <Screen>
      <EmptyState
        emoji="💊"
        title="No care tasks yet"
        message="Medications, walks, and meals you set up will show here, with today's progress."
      />
    </Screen>
  );
}
