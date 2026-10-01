import { EmptyState } from "../../components/ui/EmptyState";
import { Screen } from "../../components/ui/Screen";

// Stub tab (phase-03): the real screen lands in Phase 06.
export default function SitterTasks() {
  return (
    <Screen>
      <EmptyState
        emoji="✅"
        title="No tasks today"
        message="Tasks for the pets in your care will show up here."
      />
    </Screen>
  );
}
