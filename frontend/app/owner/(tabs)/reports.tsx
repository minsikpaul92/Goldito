import { EmptyState } from "../../../components/ui/EmptyState";
import { Screen } from "../../../components/ui/Screen";

// Stub tab (phase-03): the real screen lands in Phase 07.
export default function OwnerReports() {
  return (
    <Screen>
      <EmptyState
        emoji="📝"
        title="No reports yet"
        message="Your sitter's daily report will arrive here at the end of each day."
      />
    </Screen>
  );
}
