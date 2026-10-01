import { EmptyState } from "../../components/ui/EmptyState";
import { Screen } from "../../components/ui/Screen";

// Stub tab (phase-03): the real screen lands in Phase 03 (3.5).
export default function OwnerHome() {
  return (
    <Screen>
      <EmptyState
        emoji="🐶"
        title="No pets yet"
        message="Add your dog or cat here to start getting care updates."
      />
    </Screen>
  );
}
