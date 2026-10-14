import { router } from "expo-router";
import { StyleSheet, Text } from "react-native";

import { Screen } from "../../components/ui/Screen";
import { useThemedStyles } from "../../providers/ThemeProvider";
import { Theme } from "../../theme/themes";
import { SnapToolCard } from "./SnapToolCard";
import { SNAP_TOOLS } from "./tools";

/** The Snap tab for both roles (Phase 12, D61): treat check, mood and sticker, each starting from a photo. */
export function SnapScreen({ role }: { role: "owner" | "sitter" }) {
  const styles = useThemedStyles(makeStyles);

  return (
    <Screen contentStyle={styles.content} testID="snap">
      <Text style={styles.intro}>Snap a photo — check a treat, see a mood, make a sticker.</Text>
      {SNAP_TOOLS.map((tool) => (
        <SnapToolCard
          key={tool.key}
          emoji={tool.emoji}
          title={tool.title}
          blurb={tool.blurb}
          onPress={() => router.push(`/${role}/snap/${tool.key}`)}
          testID={`snap-card-${tool.key}`}
        />
      ))}
    </Screen>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    content: { gap: theme.spacing.md },
    intro: { fontSize: theme.fontSize.body, color: theme.color.textMuted },
  });
