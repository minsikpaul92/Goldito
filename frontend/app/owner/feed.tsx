import { EmptyState } from "../../components/ui/EmptyState";
import { Screen } from "../../components/ui/Screen";

// Stub tab (phase-03): the real screen lands in Phase 05.
export default function OwnerFeed() {
  return (
    <Screen>
      <EmptyState
        emoji="📸"
        title="No posts yet"
        message="Your sitter will share photos of your pet here."
      />
    </Screen>
  );
}
