import { ReactNode, useState } from "react";
import {
  LayoutChangeEvent,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { PetStatus } from "../../lib/petStatus";
import { formatTime, isoToZoned } from "../../features/schedule/dates";
import { useThemedStyles } from "../../providers/ThemeProvider";
import { Theme } from "../../theme/themes";
import type { Species } from "../../types/db";
import type { PixelHead } from "../../features/pets/sprites/pixelize";
import { PetSprite } from "./PetSprite";

type Props = {
  name: string;
  species: Species;
  coat?: unknown;
  breed?: string | null;
  /** A saved photo head (`pets.profile.pixel_head`), drawn instead of the preset. */
  head?: PixelHead | null;
  /** Null while it loads: the pet shows calm and the HUD stays empty. */
  status: PetStatus | null;
  /** Tapping the pet. */
  onPress?: () => void;
  /** The sitter's Home: a smaller pet beside its name and HUD, so the dashboard still fits one screen. */
  compact?: boolean;
  /** Under the HUD, e.g. the sitter's feed / walk / potty / nap buttons. */
  children?: ReactNode;
  testID?: string;
};

const MOOD_LABEL = {
  excited: "Happy",
  calm: "Calm",
  tired: "Tired",
  hungry: "Hungry",
  sleepy: "Sleepy",
} as const;

/**
 * The pet room (11.12): the 8-bit pet on a retro "screen", its mood, and a short HUD (meal, potty, walk, next task)
 * worked out from today's check-ins. Pure display: `PetRoom` loads the data.
 */
export function PetRoomCard({
  name,
  species,
  coat,
  head,
  status,
  onPress,
  compact,
  children,
  testID,
}: Props) {
  const styles = useThemedStyles(makeStyles);
  const mood = status?.mood ?? "calm";
  const hud = status ? hudItems(status, species) : [];
  const [pixel, setPixel] = useState(BIG_PIXEL_MIN);
  const fit = (e: LayoutChangeEvent) =>
    setPixel(bigPixel(e.nativeEvent.layout.width));

  if (!compact)
    return (
      <View style={styles.device} testID={testID} onLayout={fit}>
        <Pressable
          accessibilityRole={onPress ? "button" : undefined}
          accessibilityLabel={`${name}, ${MOOD_LABEL[mood]}`}
          disabled={!onPress}
          onPress={onPress}
          style={styles.lcd}
          testID={testID ? `${testID}-open` : undefined}
        >
          <View style={styles.lcdTop}>
            <Text style={styles.name}>{name}</Text>
            <Text
              style={styles.mood}
              testID={testID ? `${testID}-mood` : undefined}
            >
              {MOOD_LABEL[mood]}
            </Text>
          </View>
          <View style={styles.stage}>
            <PetSprite
              species={species}
              coat={coat}
              head={head}
              mood={mood}
              pixel={pixel}
              testID={testID ? `${testID}-sprite` : undefined}
            />
          </View>
          {hud.length > 0 ? (
            <View style={styles.hud}>
              {hud.map((item) => (
                <Text
                  key={item.key}
                  style={[styles.chip, item.warn && styles.chipWarn]}
                >
                  {item.text}
                </Text>
              ))}
            </View>
          ) : null}
          {status?.nextTask ? (
            <Text
              style={styles.next}
              testID={testID ? `${testID}-next` : undefined}
            >
              {`Next: ${status.nextTask.title} · ${formatTime(isoToZoned(status.nextTask.dueAt).time)}`}
            </Text>
          ) : null}
        </Pressable>
        {children}
      </View>
    );

  const screen = (
    <View style={styles.screen}>
      <PetSprite
        species={species}
        coat={coat}
        head={head}
        mood={mood}
        pixel={4}
        testID={testID ? `${testID}-sprite` : undefined}
      />
    </View>
  );

  const info = (
    <>
      <View style={styles.titleRow}>
        <Text style={[styles.name, styles.nameCompact]}>{name}</Text>
        <Text
          style={styles.mood}
          testID={testID ? `${testID}-mood` : undefined}
        >
          {MOOD_LABEL[mood]}
        </Text>
      </View>
      {hud.length > 0 ? (
        <View style={[styles.hud, styles.hudCompact]}>
          {hud.map((item) => (
            <Text
              key={item.key}
              style={[styles.chip, item.warn && styles.chipWarn]}
            >
              {item.text}
            </Text>
          ))}
        </View>
      ) : null}
    </>
  );
  const pet = onPress ? (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${name}, ${MOOD_LABEL[mood]}`}
      onPress={onPress}
      testID={testID ? `${testID}-open` : undefined}
    >
      {screen}
    </Pressable>
  ) : (
    screen
  );

  return (
    <View style={styles.card} testID={testID}>
      <View style={styles.compactRow}>
        {pet}
        <View style={styles.compactInfo}>
          {info}
          {children}
        </View>
      </View>
    </View>
  );
}

/** The owner's room fills the hero: the pet takes about three quarters of the screen's width, in whole sprite pixels. */
const BIG_PIXEL_MIN = 10;
const BIG_PIXEL_MAX = 20;
function bigPixel(width: number): number {
  return Math.max(
    BIG_PIXEL_MIN,
    Math.min(BIG_PIXEL_MAX, Math.floor((width * 0.72) / 16)),
  );
}

function hudItems(status: PetStatus, species: Species) {
  const items: { key: string; text: string; warn?: boolean }[] = [];
  if (status.meal === "fed") items.push({ key: "meal", text: "🍽️ Fed" });
  if (status.meal === "hungry")
    items.push({ key: "meal", text: "🍽️ Hungry", warn: true });
  if (status.potty === "done") items.push({ key: "potty", text: "💩 Done" });
  if (status.potty === "due")
    items.push({ key: "potty", text: "💩 Due", warn: true });
  if (species === "dog" && status.walkMinutes > 0)
    items.push({ key: "walk", text: `🦮 ${status.walkMinutes} min` });
  return items;
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    // The sitter's compact room: a small screen beside the name, the HUD and the taps.
    card: {
      padding: theme.spacing.sm,
      borderRadius: theme.radius.xl,
      backgroundColor: theme.color.blockButter,
    },
    // The owner's hero: the whole card is the device, its screen holds the name, the pet and the HUD.
    device: {
      alignSelf: "stretch",
      gap: theme.spacing.sm,
      padding: theme.spacing.sm,
      borderRadius: theme.radius.xl,
      backgroundColor: theme.color.text,
    },
    lcd: {
      alignItems: "center",
      gap: theme.spacing.sm,
      padding: theme.spacing.md,
      borderRadius: theme.radius.lg,
      backgroundColor: theme.color.blockButter,
    },
    lcdTop: {
      alignSelf: "stretch",
      flexDirection: "row",
      alignItems: "baseline",
      justifyContent: "space-between",
    },
    stage: {
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: theme.spacing.md,
    },
    screen: {
      alignItems: "center",
      justifyContent: "center",
      width: 76,
      height: 68,
      borderRadius: theme.radius.lg,
      borderWidth: 3,
      borderColor: theme.color.text,
      backgroundColor: theme.color.surface,
    },
    compactRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.md,
    },
    compactInfo: { flex: 1, alignItems: "stretch", gap: theme.spacing.xs },
    titleRow: {
      flexDirection: "row",
      alignItems: "baseline",
      gap: theme.spacing.sm,
    },
    nameCompact: { fontSize: theme.fontSize.body },
    hudCompact: { justifyContent: "flex-start" },
    name: {
      fontSize: theme.fontSize.title,
      fontWeight: theme.fontWeight.bold,
      color: theme.color.text,
    },
    mood: { fontSize: theme.fontSize.small, color: theme.color.textMuted },
    hud: {
      flexDirection: "row",
      flexWrap: "wrap",
      justifyContent: "center",
      gap: theme.spacing.sm,
    },
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
    chipWarn: {
      backgroundColor: theme.color.warningSurface,
      color: theme.color.warning,
    },
    next: { fontSize: theme.fontSize.small, color: theme.color.textMuted },
  });
