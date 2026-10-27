import { useState } from "react";
import { LayoutChangeEvent, Pressable, StyleSheet, View } from "react-native";

import type { ArtName } from "../../assets/art/artSvgs";
import { isoToZoned, timeToMinutes } from "../../features/schedule/dates";
import type { HatId } from "../../features/pets/sprites/hats";
import type { PetRecipe } from "../../features/pets/sprites/petLook";
import type { PixelColors } from "../../features/pets/sprites/photoColors";
import { SCENE_SIZE } from "../../features/pets/sprites/scene";
import { SIZE_SCALE, petSize } from "../../features/pets/sprites/sprites";
import type { PetEvent } from "../../features/pets/usePetBehavior";
import type { PetMood } from "../../lib/petStatus";
import { useThemedStyles } from "../../providers/ThemeProvider";
import { Theme } from "../../theme/themes";
import type { Species } from "../../types/db";
import { Art } from "../art/Art";
import { RoamingPet } from "./RoamingPet";

type Props = {
  species: Species;
  coat?: unknown;
  breed?: string | null;
  weightKg?: number | null;
  colors?: PixelColors | null;
  hat?: HatId | null;
  look?: PetRecipe | null;
  mood: PetMood;
  event?: PetEvent | null;
  /** Read out for the room (the caption under it says the same in words). */
  label: string;
  onPress?: () => void;
  testID?: string;
  spriteTestID?: string;
};

/** The window's sky by the clock (app timezone): day, evening, night. Scene colors, like the sprite's. */
const SKY = { day: "#CFE8F3", evening: "#F6C79B", night: "#2E3A59" } as const;
function skyNow(): keyof typeof SKY {
  const minutes = timeToMinutes(isoToZoned(new Date().toISOString()).time);
  if (minutes >= 7 * 60 && minutes < 17 * 60) return "day";
  if (minutes >= 17 * 60 && minutes < 20 * 60) return "evening";
  return "night";
}

/** Whole sprite pixels: the pet takes up to half the room's width and most of the wall above the floor. */
const PIXEL_MIN = 2;
const PIXEL_MAX = 9;
const FLOOR = 0.3;

/**
 * The owner's pet room (Pet room tab on Home, Mook's room trial R1+, Oct 27): a wall with a window that follows the
 * clock, a floor with a rug, the bowl and a bed, and the 8-bit pet walking on the floor. It is a picture only: the
 * name, mood and today's numbers are under it in words, so nobody has to read pixel art. Without `onPress` it is a
 * picture, not a button; the owner's room has none (Mook, Oct 27: no Diary shortcut there).
 */
export function PetRoomScene({ species, coat, breed, weightKg, colors, hat, look, mood, event, label, onPress, testID, spriteTestID }: Props) {
  const styles = useThemedStyles(makeStyles);
  const scale = SIZE_SCALE[petSize(species, weightKg)];
  const [stage, setStage] = useState({ width: 0, pixel: PIXEL_MIN });
  const fit = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setStage({ width, pixel: Math.max(PIXEL_MIN, Math.min(PIXEL_MAX, Math.floor(Math.min(width * 0.5, height * 0.9) / SCENE_SIZE))) });
  };
  const sky = skyNow();
  const bowl: ArtName = "owner/care-bowl";

  return (
    <Pressable
      accessibilityRole={onPress ? "button" : "image"}
      accessibilityLabel={label}
      accessibilityHint={onPress ? "Opens the Diary" : undefined}
      disabled={!onPress}
      onPress={onPress}
      style={styles.room}
      testID={testID}
    >
      <View style={styles.wall} />
      <View style={[styles.window, { backgroundColor: SKY[sky] }]}>
        <View style={[styles.orb, sky === "night" ? styles.moon : styles.sun]} />
        <View style={styles.sill} />
      </View>
      <View style={styles.floor} />
      <View style={styles.rug} />
      <View style={styles.bowl} pointerEvents="none">
        <Art name={bowl} size={44} />
      </View>
      <View style={styles.bed} pointerEvents="none">
        <View style={styles.bedTop} />
      </View>
      {/* The pet walks on the floor: the stage ends a little into it. */}
      <View style={styles.stage} onLayout={fit} pointerEvents="none">
        {stage.width > 0 ? (
          <RoamingPet
            species={species}
            coat={coat}
            breed={breed}
            colors={colors}
            weightKg={weightKg}
            look={look}
            hat={hat}
            mood={mood}
            pixel={Math.max(2, Math.floor(stage.pixel * scale))}
            roomWidth={stage.width}
            event={event}
            testID={spriteTestID}
          />
        ) : null}
      </View>
    </Pressable>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    room: {
      alignSelf: "stretch",
      aspectRatio: 1.45,
      maxHeight: 300,
      borderRadius: theme.radius.xl,
      overflow: "hidden",
      backgroundColor: theme.color.blockButter,
    },
    wall: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: theme.color.blockButter },
    window: {
      position: "absolute",
      top: "12%",
      left: "8%",
      width: "30%",
      height: "36%",
      borderRadius: theme.radius.lg,
      borderWidth: 4,
      borderColor: theme.color.surface,
      overflow: "hidden",
    },
    orb: { position: "absolute", top: "18%", right: "16%", width: 18, height: 18, borderRadius: 9 },
    sun: { backgroundColor: "#F4A261" },
    moon: { backgroundColor: "#F1E9C9" },
    sill: { position: "absolute", left: 0, right: 0, bottom: 0, height: 6, backgroundColor: theme.color.surface },
    floor: { position: "absolute", left: 0, right: 0, bottom: 0, height: `${FLOOR * 100}%`, backgroundColor: theme.color.blockPeach },
    rug: {
      position: "absolute",
      left: "22%",
      right: "22%",
      bottom: "6%",
      height: "12%",
      borderRadius: 999,
      backgroundColor: theme.color.blockBlush,
    },
    bowl: { position: "absolute", left: "5%", bottom: "9%" },
    bed: {
      position: "absolute",
      right: "4%",
      bottom: "7%",
      width: "26%",
      height: "13%",
      borderRadius: theme.radius.lg,
      backgroundColor: theme.color.primary,
      padding: 4,
    },
    bedTop: { flex: 1, borderRadius: theme.radius.md, backgroundColor: theme.color.accent },
    stage: { position: "absolute", left: "4%", right: "4%", top: 0, bottom: `${FLOOR * 100 - 14}%` },
  });
