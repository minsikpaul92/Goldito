import { View } from "react-native";

import { EmptyState } from "../../components/ui/EmptyState";
import { Screen } from "../../components/ui/Screen";
import { SnapTool, snapTool } from "./tools";

/** A Snap tool's screen until its step of Phase 12 lands (12.1 treat · 12.2 mood · 12.3 sticker). */
export function SnapToolPlaceholder({ tool }: { tool: SnapTool }) {
  const { emoji, title, coming } = snapTool(tool);

  return (
    <Screen>
      <View testID={`snap-tool-${tool}`}>
        <EmptyState emoji={emoji} title={title} message={`Coming soon — ${coming}`} />
      </View>
    </Screen>
  );
}
