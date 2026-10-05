import { router } from "expo-router";

import { EmptyState } from "../../../components/ui/EmptyState";
import { Screen } from "../../../components/ui/Screen";

/**
 * Owner Diary tab (D47): the sitter's own written diary of the day — the evening report that
 * arrives with Phase 07. The live stream (tasks, check-ins, photos) is on Home; the full record
 * is in History.
 */
export default function OwnerDiary() {
  return (
    <Screen>
      <EmptyState
        emoji="📔"
        title="No diary yet"
        message="When your sitter writes up the day, it shows up here. Live updates are on Home, and everything they did is in History."
        action={{ label: "Open History", onPress: () => router.push("/owner/history") }}
      />
    </Screen>
  );
}
