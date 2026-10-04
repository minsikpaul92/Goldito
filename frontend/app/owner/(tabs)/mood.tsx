import { EmptyState } from "../../../components/ui/EmptyState";
import { Screen } from "../../../components/ui/Screen";

/**
 * Owner Mood tab (D47 placeholder → 11.9). Fun-only pet mood from a photo or short clip.
 */
export default function OwnerMood() {
  return (
    <Screen>
      <EmptyState
        emoji="😊"
        title="Mood"
        message="Snap or pick a clip to see how Max or Mochi seems today — for fun only, not a health check."
      />
    </Screen>
  );
}
