import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { PetMedal, listPetMedals } from "../../features/pets/medalApi";
import { formatDay, isoToZoned } from "../../features/schedule/dates";
import { useThemedStyles } from "../../providers/ThemeProvider";
import { Theme } from "../../theme/themes";

const dayOf = (iso: string) => isoToZoned(iso).day;

/** "Oct 5" or "Oct 5 to Oct 7" for a one-day stay. */
function stayLabel(m: PetMedal): string {
  const from = dayOf(m.stayFrom);
  const to = dayOf(m.stayTo);
  return from === to ? formatDay(from) : `${formatDay(from)} to ${formatDay(to)}`;
}

/** The medals a sitter gave this pet after a stay (11.12), newest first; nothing at all while there are none. */
export function PetMedals({ petId, reloadKey }: { petId: string; reloadKey?: unknown }) {
  const styles = useThemedStyles(makeStyles);
  const [medals, setMedals] = useState<PetMedal[]>([]);

  useEffect(() => {
    let live = true;
    setMedals([]);
    void listPetMedals(petId)
      .then((list) => live && setMedals(list))
      .catch(() => undefined); // The medals are a bonus under the pet room.
    return () => {
      live = false;
    };
  }, [petId, reloadKey]);

  if (medals.length === 0) return null;
  return (
    <View style={styles.root} testID="pet-medals">
      {medals.map((m) => (
        <View key={m.id} style={styles.row} testID={`medal-${m.id}`}>
          <Text style={styles.emoji}>🏅</Text>
          <View style={styles.text}>
            <Text style={styles.title}>{m.sitterName}</Text>
            <Text style={styles.when}>{stayLabel(m)}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    root: { gap: theme.spacing.sm },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.md,
      padding: theme.spacing.md,
      borderRadius: theme.radius.lg,
      backgroundColor: theme.color.blockButter,
    },
    emoji: { fontSize: theme.icon.md },
    text: { flex: 1 },
    title: { fontSize: theme.fontSize.body, fontWeight: theme.fontWeight.semibold, color: theme.color.text },
    when: { fontSize: theme.fontSize.small, color: theme.color.textMuted },
  });
