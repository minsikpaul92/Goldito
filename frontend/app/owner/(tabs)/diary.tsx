import { EmptyState } from "../../../components/ui/EmptyState";
import { Screen } from "../../../components/ui/Screen";

/**
 * Owner Diary tab (D47) — Live stay log + history (pet / sitter / date).
 * Was Reports. Photo entries also mirror to Feed. Full UI in later Phase 05–07 work.
 */
export default function OwnerDiary() {
  return (
    <Screen>
      <EmptyState
        emoji="📔"
        title="No diary yet"
        message="When a stay is on, updates show up here live. You can also write your own entries — photos go to Feed too."
      />
    </Screen>
  );
}
