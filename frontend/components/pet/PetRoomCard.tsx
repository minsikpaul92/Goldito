import { ReactNode, useState } from "react";
import { LayoutChangeEvent, Pressable, StyleSheet, Text, View } from "react-native";

import { PetStatus } from "../../lib/petStatus";
import { formatTime, isoToZoned } from "../../features/schedule/dates";
import type { PixelColors } from "../../features/pets/sprites/photoColors";
import { SCENE_SIZE } from "../../features/pets/sprites/scene";
import { SIZE_SCALE, petSize } from "../../features/pets/sprites/sprites";
import { useThemedStyles } from "../../providers/ThemeProvider";
import { Theme } from "../../theme/themes";
import type { Species } from "../../types/db";
import type { HatId } from "../../features/pets/sprites/hats";
import type { PetEvent } from "../../features/pets/usePetBehavior";
import { RoamingPet } from "./RoamingPet";

type Props = {
  name: string;
  species: Species;
  coat?: unknown;
  /** `pets.breed`: picks the head shape. */
  breed?: string | null;
  /** `pets.weight_kg`: a small dog takes less of the screen than a big one. */
  weightKg?: number | null;
  /** Colors picked from a photo (`pets.profile.pixel_colors`), instead of the coat. */
  colors?: PixelColors | null;
  /** A hat on its head (the pumpkin hat during the Halloween event). */
  hat?: HatId | null;
  /** Null while it loads: the pet shows calm and the HUD stays empty. */
  status: PetStatus | null;
  /** What the pet just did (ate, went potty): the room shows it once. */
  event?: PetEvent | null;
  /** Tapping the pet. */
  onPress?: () => void;
  /** Under the HUD, e.g. the sitter's feed / walk / potty / nap buttons. */
  children?: ReactNode;
  testID?: string;
};

const MOOD_LABEL = { excited: "Happy", calm: "Calm", tired: "Tired", hungry: "Hungry", sleepy: "Sleepy" } as const;

/**
 * The pet room (11.12): the 8-bit pet on a retro "screen", its mood, and a short HUD (meal, potty, walk, next task)
 * worked out from today's check-ins. Pure display: `PetRoom` loads the data. The room fills the space its parent gives
 * it (the owner's Pet page, the top of the sitter's Home) and the pet grows to fit, so it is the biggest thing on Home.
 */
export function PetRoomCard({ name, species, coat, breed, weightKg, colors, hat, status, event, onPress, children, testID }: Props) {
  const styles = useThemedStyles(makeStyles);
  const mood = status?.mood ?? "calm";
  const hud = status ? hudItems(status, species) : [];
  const scale = SIZE_SCALE[petSize(species, weightKg)];
  const [pixel, setPixel] = useState(PIXEL_MIN);
  const [roomWidth, setRoomWidth] = useState(0);
  const fit = (e: LayoutChangeEvent) => {
    setPixel(stagePixel(e.nativeEvent.layout.width, e.nativeEvent.layout.height));
    setRoomWidth(e.nativeEvent.layout.width);
  };

  return (
    <View style={styles.device} testID={testID}>
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
          <Text style={styles.mood} testID={testID ? `${testID}-mood` : undefined}>
            {MOOD_LABEL[mood]}
          </Text>
        </View>
        {/* The stage takes the room that is left and is sized for the biggest dog, so switching pets never moves the page. */}
        <View style={styles.stage} onLayout={fit}>
          <RoamingPet
            species={species}
            coat={coat}
            breed={breed}
            colors={colors}
            hat={hat}
            mood={mood}
            pixel={Math.max(2, Math.floor(pixel * scale))}
            roomWidth={roomWidth}
            event={event}
            testID={testID ? `${testID}-sprite` : undefined}
          />
        </View>
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
      </Pressable>
      {children}
    </View>
  );
}

/** Whole sprite pixels: a big dog takes up to 62% of the stage's width and all of its height. */
const PIXEL_MIN = 2;
const PIXEL_MAX = 12;
function stagePixel(width: number, height: number): number {
  return Math.max(PIXEL_MIN, Math.min(PIXEL_MAX, Math.floor(Math.min(width * 0.62, height) / SCENE_SIZE)));
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
    // The whole card is the device, its screen holds the name, the pet and the HUD; both grow into the parent's space.
    device: { flex: 1, alignSelf: "stretch", gap: theme.spacing.sm, padding: theme.spacing.sm, borderRadius: theme.radius.xl, backgroundColor: theme.color.text },
    lcd: { flex: 1, alignItems: "center", gap: theme.spacing.sm, padding: theme.spacing.md, borderRadius: theme.radius.lg, backgroundColor: theme.color.blockButter },
    lcdTop: { alignSelf: "stretch", flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" },
    // The pet walks on the floor: a strip along the bottom of the stage.
    stage: { flex: 1, alignSelf: "stretch", minHeight: SCENE_SIZE * PIXEL_MIN, overflow: "hidden", borderBottomWidth: 6, borderBottomColor: theme.color.blockPeach },
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
