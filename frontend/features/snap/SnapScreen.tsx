import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Art } from "../../components/art/Art";
import { HOME_TEXT } from "../../components/home/homeType";
import { Screen } from "../../components/ui/Screen";
import { TextButton } from "../../components/ui/TextButton";
import { sectionTitleStyle } from "../../components/ui/SectionTitle";
import { useThemedStyles } from "../../providers/ThemeProvider";
import { Theme } from "../../theme/themes";
import { tokens } from "../../theme/tokens";
import { PetOption, Role, SnapPets } from "./SnapPets";
import { SnapToolCard } from "./SnapToolCard";
import { SNAP_TOOLS, SnapTool } from "./tools";
import { CheckRow } from "./CheckRow";
import { SafetyCheck, listRecentChecksForPets } from "./treatApi";

/** The look of each card: its tint and its drawing (Figma 1730:104290). */
const LOOK: Record<SnapTool, { ground: string; art: React.ReactNode }> = {
  treat: { ground: tokens.color.blockPeach, art: <Art name="snap/treat-bowl" size={64} /> },
  mood: { ground: tokens.color.blockMint, art: <Art name="snap/mood-heart" size={64} /> },
  // The paw is drawn smaller than its 64 x 64 slot: the Figma frame insets it.
  sticker: { ground: tokens.color.blockButter, art: <Art name="snap/sticker-paw" size={38.93} height={37.33} /> },
};

/** The Snap tab for both roles (Phase 12, D61): pick the pet, then treat check, mood or sticker, each starting from a photo. */
export function SnapScreen({ role }: { role: Role }) {
  return (
    <Screen contentStyle={contentStyle} testID="snap">
      <SnapPets role={role}>{(pets) => <SnapBody key={pets.status === "ready" ? "ready" : "wait"} role={role} pets={pets.status === "ready" ? pets.pets : []} />}</SnapPets>
    </Screen>
  );
}

const contentStyle = { gap: 14 } as const;

function SnapBody({ role, pets }: { role: Role; pets: PetOption[] }) {
  const styles = useThemedStyles(makeStyles);
  const [selectedId, setSelectedId] = useState<string | null>(pets[0]?.id ?? null);
  const pet = pets.find((p) => p.id === selectedId) ?? pets[0] ?? null;
  const name = pet?.name ?? "your pet";
  const query = pet ? `?pet=${pet.id}` : "";

  return (
    <>
      {pets.length > 1 ? (
        <View style={styles.chips} testID="snap-pets">
          {pets.map((p) => {
            const on = p.id === pet?.id;
            return (
              <Pressable
                key={p.id}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                onPress={() => setSelectedId(p.id)}
                style={[styles.chip, on && styles.chipOn]}
                testID={`snap-pet-${p.id}`}
              >
                <Art name={p.species === "cat" ? "snap/chip-cat" : "snap/chip-dog"} size={28} />
                <Text style={[styles.chipText, on && styles.chipTextOn]}>{p.name}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {SNAP_TOOLS.map((tool) => (
        <SnapToolCard
          key={tool.key}
          art={LOOK[tool.key].art}
          ground={LOOK[tool.key].ground}
          title={tool.title}
          blurb={tool.blurb(name)}
          onPress={() => router.push(`/${role}/snap/${tool.key}${query}`)}
          testID={`snap-card-${tool.key}`}
        />
      ))}

      {pet ? <RecentChecks role={role} pet={pet} /> : null}
    </>
  );
}

/** The last two treat checks of the pet picked; a row opens that check, See all lists more. */
function RecentChecks({ role, pet }: { role: Role; pet: PetOption }) {
  const styles = useThemedStyles(makeStyles);
  const [checks, setChecks] = useState<SafetyCheck[]>([]);

  // Every time the Snap tab is shown again (after a check on the Treat check screen), not only when the pet changes.
  useFocusEffect(
    useCallback(() => {
      let live = true;
      listRecentChecksForPets([pet.id], 2)
        .then((list) => live && setChecks(list))
        .catch(() => live && setChecks([])); // A bonus list: the tools above work without it.
      return () => {
        live = false;
      };
    }, [pet.id]),
  );

  if (checks.length === 0) return null;
  return (
    <View style={styles.section} testID="snap-recent">
      <View style={styles.sectionHead}>
        <Text accessibilityRole="header" style={styles.sectionTitle}>
          Recent checks
        </Text>
        <TextButton label="See all" onPress={() => router.push(`/${role}/snap/checks?pet=${pet.id}`)} testID="snap-see-all" />
      </View>
      <View style={styles.list}>
        {checks.map((c) => (
          <CheckRow key={c.id} check={c} petName={pet.name} onPress={() => router.push(`/${role}/snap/treat?check=${c.id}`)} testID="snap-recent-row" />
        ))}
      </View>
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    chip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingLeft: 6,
      paddingRight: 12,
      paddingVertical: 6,
      borderRadius: theme.radius.pill,
      borderWidth: 1,
      borderColor: theme.color.borderStrong,
      backgroundColor: theme.color.surface,
    },
    chipOn: { backgroundColor: theme.color.text, borderColor: theme.color.text },
    chipText: { fontSize: HOME_TEXT.chip, lineHeight: 18.2, fontWeight: theme.fontWeight.bold, color: theme.color.text },
    chipTextOn: { color: theme.color.primaryText },
    section: { gap: 10 },
    sectionHead: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" },
    sectionTitle: sectionTitleStyle(theme),
    list: { gap: 10 },
  });
