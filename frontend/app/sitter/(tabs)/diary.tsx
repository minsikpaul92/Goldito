import { EmptyState } from "../../../components/ui/EmptyState";
import { Screen } from "../../../components/ui/Screen";

/**
 * Sitter Diary (D47b) — stay log + evening chips (was Report / Tasks write path).
 */
export default function SitterDiary() {
  return (
    <Screen>
      <EmptyState
        emoji="📔"
        title="Diary"
        message="Log checks and send the evening note from here when you're caring for a pet."
      />
    </Screen>
  );
}
