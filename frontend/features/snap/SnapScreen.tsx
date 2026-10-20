import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Screen } from "../../components/ui/Screen";
import { useThemedStyles } from "../../providers/ThemeProvider";
import { Theme } from "../../theme/themes";
import { PetOption, Role, SnapPets } from "./SnapPets";
import { SnapToolCard } from "./SnapToolCard";
import { StatusBadge } from "./TreatCheckScreen";
import { SNAP_TOOLS } from "./tools";
import { SafetyCheck, listRecentChecksForPets } from "./treatApi";

/** The Snap tab for both roles (Phase 12, D61): treat check, mood and sticker, each starting from a photo. */
export function SnapScreen({ role }: { role: Role }) {
  const styles = useThemedStyles(makeStyles);

  return (
    <Screen contentStyle={styles.content} testID="snap">
      <Text style={styles.intro}>Check a treat, see a mood, make a sticker.</Text>
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
      <SnapPets role={role}>{(pets) => (pets.status === "ready" ? <RecentChecks role={role} pets={pets.pets} /> : null)}</SnapPets>
    </Screen>
  );
}

/** The last three treat checks across the role's pets; a row opens that check on the Treat check screen. */
function RecentChecks({ role, pets }: { role: Role; pets: PetOption[] }) {
  const styles = useThemedStyles(makeStyles);
  const [checks, setChecks] = useState<SafetyCheck[]>([]);
  const key = pets.map((p) => p.id).join(",");

  // Every time the Snap tab is shown again (after a check on the Treat check screen), not only when the pets change.
  useFocusEffect(
    useCallback(() => {
      let live = true;
      listRecentChecksForPets(key ? key.split(",") : [])
        .then((list) => live && setChecks(list))
        .catch(() => live && setChecks([])); // A bonus list: the tools above work without it.
      return () => {
        live = false;
      };
    }, [key]),
  );

  if (checks.length === 0) return null;
  return (
    <View style={styles.section} testID="snap-recent">
      <Text style={styles.label}>Recent checks</Text>
      {checks.map((c) => (
        <Pressable
          key={c.id}
          accessibilityRole="button"
          onPress={() => router.push(`/${role}/snap/treat?check=${c.id}`)}
          style={styles.row}
          testID="snap-recent-row"
        >
          <StatusBadge status={c.safety_status} />
          <Text style={styles.name} numberOfLines={1}>
            {c.product_name || "Treat label"}
            {pets.length > 1 ? ` · ${pets.find((p) => p.id === c.petId)?.name ?? ""}` : ""}
          </Text>
          <Text style={styles.date}>{new Date(c.createdAt).toLocaleDateString()}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    content: { gap: theme.spacing.md },
    intro: { fontSize: theme.fontSize.body, color: theme.color.textMuted },
    section: { gap: theme.spacing.xs },
    label: { fontSize: theme.fontSize.small, fontWeight: theme.fontWeight.semibold, color: theme.color.textMuted },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.sm,
      paddingVertical: theme.spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: theme.color.border,
    },
    name: { flex: 1, fontSize: theme.fontSize.body, color: theme.color.text },
    date: { fontSize: theme.fontSize.small, color: theme.color.textMuted },
  });
