import { EmptyState } from "../../../components/ui/EmptyState";
import { Screen } from "../../../components/ui/Screen";

/** Sitter Feed tab (D47b) — album upload entry; pet FAB UI lands with Phase 05. */
export default function SitterFeed() {
  return (
    <Screen>
      <EmptyState
        emoji="📸"
        title="Share a moment"
        message="Photos you post for pets in your care show up in the owner's Feed album."
      />
    </Screen>
  );
}
