import { StyleSheet, Text, View } from "react-native";

import { formatTime, isoToZoned } from "../../features/schedule/dates";
import type { HatId } from "../../features/pets/sprites/hats";
import type { PetRecipe } from "../../features/pets/sprites/petLook";
import type { PixelColors } from "../../features/pets/sprites/photoColors";
import { useLatestSitterPhoto } from "../../features/pets/useLatestSitterPhoto";
import { usePetRoom } from "../../features/pets/usePetRoom";
import type { PetMood, PetStatus } from "../../lib/petStatus";
import { useTheme, useThemedStyles } from "../../providers/ThemeProvider";
import { Theme } from "../../theme/themes";
import { tokens } from "../../theme/tokens";
import type { Species } from "../../types/db";
import { HOME_TEXT } from "../home/homeType";
import { StatTile, StatTileRow, walkLabel } from "../home/StatTiles";
import { Icon, IconName } from "../ui/Icon";
import { Tag, TagTone } from "../ui/Tag";
import { PetRoomScene } from "./PetRoomScene";

type Pet = { id: string; name: string; species: Species; coat?: unknown; breed?: string | null; weightKg?: number | null; colors?: PixelColors | null; hat?: HatId | null; look?: PetRecipe | null };

const MOOD: Record<PetMood, { label: string; tone: TagTone; icon: IconName }> = {
  excited: { label: "Happy", tone: "brand", icon: "moodHappy" },
  calm: { label: "Calm", tone: "brand", icon: "moodCalm" },
  tired: { label: "Tired", tone: "brand", icon: "moodTired" },
  hungry: { label: "Hungry", tone: "warning", icon: "meal" },
  sleepy: { label: "Sleepy", tone: "brand", icon: "nap" },
};

/** One plain sentence for the room, so anyone gets the status without reading the pixel art. */
function sentence(name: string, status: PetStatus): string {
  if (status.sleeping) return `${name} is napping.`;
  if (status.meal === "hungry") return `${name} is waiting for a meal.`;
  if (status.mood === "excited") return `${name} is in a playful mood.`;
  if (status.mood === "tired") return `${name} is a little tired.`;
  if (status.meal === "unknown" && status.potty === "unknown" && status.walkMinutes === 0) return `No updates on ${name} yet today.`;
  return `${name} is relaxed.`;
}

/** The pet's own tiles: meal, potty, and walks for a dog (cats have no walks, and no play check-in yet). */
function petTiles(status: PetStatus, species: Species): StatTile[] {
  const tiles: StatTile[] = [
    status.meal === "fed"
      ? { key: "meal", icon: "meal", art: "owner/care-bowl", value: "Fed", label: "ate well", ground: tokens.color.blockMint }
      : status.meal === "hungry"
        ? { key: "meal", icon: "meal", art: "owner/care-bowl", value: "Meal", label: "skipped", ground: tokens.color.blockMint, warn: true }
        : { key: "meal", icon: "meal", art: "owner/care-bowl", value: "Meal", label: "not logged yet", ground: tokens.color.blockMint },
  ];
  const potty = species === "cat" ? "owner/potty-scoop" : "owner/potty-bags";
  tiles.push(
    status.potty === "done"
      ? { key: "potty", icon: "potty", art: potty, value: "Done", label: "potty today", ground: tokens.color.blockPeach }
      : status.potty === "due"
        ? { key: "potty", icon: "potty", art: potty, value: "Due", label: "no potty yet", ground: tokens.color.blockPeach, warn: true }
        : { key: "potty", icon: "potty", art: potty, value: "Potty", label: "not logged yet", ground: tokens.color.blockPeach },
  );
  if (species === "dog") {
    tiles.push({ key: "walks", icon: "walk", art: "owner/walk-leash", value: walkLabel(status.walkMinutes), label: "of walks", ground: tokens.color.blockButter });
  }
  return tiles;
}

/**
 * The top of the Pet room tab (Mook's room trial R1+, Oct 27): the room, then the same story in words (name, mood
 * Tag, one sentence, when it was last updated), the pet's own stat tiles in Today's style, and the next task.
 */
export function OwnerPetRoom({ pet }: { pet: Pet }) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { status, event, updatedAt } = usePetRoom(pet.id);
  const photo = useLatestSitterPhoto(pet.id);
  const mood = MOOD[status?.mood ?? "calm"];

  return (
    <View style={styles.root} testID={`pet-room-${pet.name}`}>
      <PetRoomScene
        name={pet.name}
        species={pet.species}
        coat={pet.coat}
        breed={pet.breed}
        weightKg={pet.weightKg}
        colors={pet.colors}
        hat={pet.hat}
        look={pet.look}
        mood={status?.mood ?? "calm"}
        hungry={status?.meal === "hungry"}
        photo={photo}
        event={event}
        label={`${pet.name}'s room. ${mood.label}.`}
        testID={`pet-room-${pet.name}-open`}
        spriteTestID={`pet-room-${pet.name}-sprite`}
      />
      <View style={styles.caption} accessibilityLiveRegion="polite">
        <View style={styles.nameRow}>
          <Text accessibilityRole="header" style={styles.name}>
            {pet.name}
          </Text>
          {status ? <Tag label={mood.label} tone={mood.tone} icon={mood.icon} testID={`pet-room-${pet.name}-mood`} /> : null}
        </View>
        {status ? <Text style={styles.sentence}>{sentence(pet.name, status)}</Text> : null}
        {updatedAt ? <Text style={styles.updated}>{`Updated ${formatTime(isoToZoned(updatedAt).time)}`}</Text> : null}
      </View>
      {status ? <StatTileRow tiles={petTiles(status, pet.species)} testID="pet-stat-tiles" /> : null}
      {status?.nextTask ? (
        <View style={styles.next} testID={`pet-room-${pet.name}-next`}>
          <View style={styles.nextIcon}>
            <Icon name="clock" size={20} color={theme.color.primary} />
          </View>
          <View style={styles.nextText}>
            <Text style={styles.nextWhen}>{`Next · ${formatTime(isoToZoned(status.nextTask.dueAt).time)}`}</Text>
            <Text style={styles.nextTitle}>{status.nextTask.title}</Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    root: { gap: 14 },
    caption: { gap: 2 },
    nameRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: theme.spacing.sm, rowGap: theme.spacing.xs },
    name: {
      ...(theme.fontFamily.display ? { fontFamily: theme.fontFamily.display } : { fontWeight: theme.fontWeight.bold }),
      fontSize: 24,
      lineHeight: 30,
      color: theme.color.text,
    },
    sentence: { fontSize: theme.fontSize.body, lineHeight: theme.lineHeight.body, fontWeight: theme.fontWeight.semibold, color: theme.color.text },
    updated: { fontSize: theme.fontSize.small, lineHeight: theme.lineHeight.small, color: theme.color.textMuted },
    next: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.md,
      padding: theme.spacing.md,
      borderRadius: theme.radius.lg,
      borderWidth: 1,
      borderColor: theme.color.border,
      backgroundColor: theme.color.surface,
    },
    nextIcon: { width: 40, height: 40, borderRadius: theme.radius.md, alignItems: "center", justifyContent: "center", backgroundColor: theme.color.accent },
    nextText: { flex: 1, minWidth: 0 },
    nextWhen: { fontSize: HOME_TEXT.small + 2, lineHeight: 18, color: theme.color.textMuted },
    nextTitle: { fontSize: theme.fontSize.body, lineHeight: theme.lineHeight.body, fontWeight: theme.fontWeight.semibold, color: theme.color.text },
  });
