import { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { PetStatus } from "../../lib/petStatus";
import { formatTime, isoToZoned } from "../../features/schedule/dates";
import { useThemedStyles } from "../../providers/ThemeProvider";
import { Theme } from "../../theme/themes";
import type { Species } from "../../types/db";
import { PetSprite } from "./PetSprite";

type Props = {
  name: string;
  species: Species;
  coat?: unknown;
  /** Null while it loads: the pet shows calm and the HUD stays empty. */
  status: PetStatus | null;
  /** Tapping the pet. */
  onPress?: () => void;
  /** Under the HUD, e.g. the sitter's feed / walk / potty / nap buttons. */
  children?: ReactNode;
  testID?: string;
};

const MOOD_LABEL = { excited: "Happy", calm: "Calm", tired: "Tired", hungry: "Hungry", sleepy: "Sleepy" } as const;

/**
 * The pet room (11.12): the 8-bit pet on a retro "screen", its mood, and a short HUD (meal, potty, walk, next task)
 * worked out from today's check-ins. Pure display: `PetRoom` loads the data.
 */
export function PetRoomCard({ name, species, coat, status, onPress, children, testID }: Props) {
  const styles = useThemedStyles(makeStyles);
  const mood = status?.mood ?? "calm";
  const hud = status ? hudItems(status, species) : [];

  const screen = (
    <View style={styles.screen}>
      <PetSprite species={species} coat={coat} mood={mood} pixel={8} testID={testID ? `${testID}-sprite` : undefined} />
    </View>
  );

  return (
    <View style={styles.card} testID={testID}>
      {onPress ? (
        <Pressable accessibilityRole="button" accessibilityLabel={`${name}, ${MOOD_LABEL[mood]}`} onPress={onPress} testID={testID ? `${testID}-open` : undefined}>
          {screen}
        </Pressable>
      ) : (
        screen
      )}
      <Text style={styles.name}>{name}</Text>
      <Text style={styles.mood} testID={testID ? `${testID}-mood` : undefined}>
        {MOOD_LABEL[mood]}
      </Text>
      {hud.length > 0 ? (
        <View style={styles.hud}>
          {hud.map((item) => (
            <Text key={item.key} style={[styles.chip, item.warn && styles.chipWarn]}>
              {item.text}
            </Text>
          ))}
        </View>
      ) : null}
      {status?.nextTask ? (
        <Text style={styles.next} testID={testID ? `${testID}-next` : undefined}>
          {`Next: ${status.nextTask.title} · ${formatTime(isoToZoned(status.nextTask.dueAt).time)}`}
        </Text>
      ) : null}
      {children}
    </View>
  );
}

function hudItems(status: PetStatus, species: Species) {
  const items: { key: string; text: string; warn?: boolean }[] = [];
  if (status.meal === "fed") items.push({ key: "meal", text: "🍽️ Fed" });
  if (status.meal === "hungry") items.push({ key: "meal", text: "🍽️ Hungry", warn: true });
  if (status.potty === "done") items.push({ key: "potty", text: "💩 Done" });
  if (status.potty === "due") items.push({ key: "potty", text: "💩 Due", warn: true });
  if (species === "dog" && status.walkMinutes > 0) items.push({ key: "walk", text: `🦮 ${status.walkMinutes} min` });
  return items;
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    card: {
      alignItems: "center",
      gap: theme.spacing.sm,
      padding: theme.spacing.md,
      borderRadius: theme.radius.xl,
      backgroundColor: theme.color.blockButter,
    },
    // The little "device screen" the pet lives in.
    screen: {
      alignItems: "center",
      justifyContent: "center",
      width: 192,
      height: 176,
      borderRadius: theme.radius.lg,
      borderWidth: 4,
      borderColor: theme.color.text,
      backgroundColor: theme.color.surface,
    },
    name: { fontSize: theme.fontSize.title, fontWeight: theme.fontWeight.bold, color: theme.color.text },
    mood: { fontSize: theme.fontSize.small, color: theme.color.textMuted },
    hud: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: theme.spacing.sm },
    chip: {
      paddingHorizontal: theme.spacing.sm,
      paddingVertical: theme.spacing.xs,
      borderRadius: theme.radius.pill,
      overflow: "hidden",
      backgroundColor: theme.color.surface,
      fontSize: theme.fontSize.small,
      fontWeight: theme.fontWeight.semibold,
      color: theme.color.text,
    },
    chipWarn: { backgroundColor: theme.color.warningSurface, color: theme.color.warning },
    next: { fontSize: theme.fontSize.small, color: theme.color.textMuted },
  });
