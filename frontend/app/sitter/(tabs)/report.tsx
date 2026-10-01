import { EmptyState } from "../../../components/ui/EmptyState";
import { Screen } from "../../../components/ui/Screen";

// Stub tab (phase-03): the real screen lands in Phase 07.
export default function SitterReport() {
  return (
    <Screen>
      <EmptyState
        emoji="📝"
        title="Daily report"
        message="Send the owner a warm end-of-day note in a few taps."
      />
    </Screen>
  );
}
