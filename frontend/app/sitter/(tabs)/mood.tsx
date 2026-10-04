import { EmptyState } from "../../../components/ui/EmptyState";
import { Screen } from "../../../components/ui/Screen";

/** Sitter Mood tab (D47b placeholder → 11.9). */
export default function SitterMood() {
  return (
    <Screen>
      <EmptyState
        emoji="😊"
        title="Mood"
        message="Snap or pick a clip to see how a pet seems — for fun only, not a health check."
      />
    </Screen>
  );
}
