import { EmptyState } from "../../components/ui/EmptyState";
import { Screen } from "../../components/ui/Screen";

// Stub tab (phase-03): the real screen lands in Phase 08.
export default function SitterScan() {
  return (
    <Screen>
      <EmptyState
        emoji="🔍"
        title="Treat scanner"
        message="Check a treat label for allergens before you feed it."
      />
    </Screen>
  );
}
