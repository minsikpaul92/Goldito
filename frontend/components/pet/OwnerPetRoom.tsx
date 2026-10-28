import { StyleSheet, Text, View } from "react-native";

import { formatTime, isoToZoned } from "../../features/schedule/dates";
import type { HatId } from "../../features/pets/sprites/hats";
import type { PetRecipe } from "../../features/pets/sprites/petLook";
import type { PixelColors } from "../../features/pets/sprites/photoColors";
import { useLatestSitterPhoto } from "../../features/pets/useLatestSitterPhoto";
import { usePetRoom, type LatestCheckins } from "../../features/pets/usePetRoom";
import type { PetMood, PetStatus, StatusCheckin } from "../../lib/petStatus";
import { useTheme, useThemedStyles } from "../../providers/ThemeProvider";
import { Theme } from "../../theme/themes";
import { tokens } from "../../theme/tokens";
import type { Species } from "../../types/db";
import type { ArtName } from "../../assets/art/artSvgs";
import { Art } from "../art/Art";
import { HOME_TEXT } from "../home/homeType";
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

/** Whether the sitter logged anything today that the rows would show. */
const logged = (status: PetStatus) => status.meal !== "unknown" || status.potty !== "unknown" || status.walkMinutes > 0;

type Row = { key: string; art: ArtName; ground: string; label: string; value: string; warn?: boolean };

const at = (c: StatusCheckin) => formatTime(isoToZoned(c.at).time);

/**
 * The pet's day in one grammar (Mook's pick C, Oct 28): a row per thing, what it is on the left, what happened and when
 * on the right. Meal, potty, and walks for a dog (cats have no walks, and no play check-in yet).
 */
function petRows(status: PetStatus, species: Species, latest: LatestCheckins): Row[] {
  const meal = latest.meal;
  const mealText =
    status.meal === "fed" && meal
      ? `${meal.value === "most" ? "Left a little" : "Ate well"} · ${at(meal)}`
      : status.meal === "hungry" && meal
        ? meal.value === "all" || meal.value === "most"
          ? `Last at ${at(meal)}`
          : `${meal.value === "none" ? "Skipped" : "Ate a little"} · ${at(meal)}`
        : status.meal === "hungry"
          ? "None yet"
          : "Not yet";
  const potty = latest.potty;
  const pottyText = status.potty === "done" && potty ? (potty.value === "soft" ? `Soft · ${at(potty)}` : at(potty)) : status.potty === "due" ? "None yet" : "Not yet";
  const rows: Row[] = [
    { key: "meal", art: "owner/care-bowl", ground: tokens.color.blockMint, label: "Meal", value: mealText, warn: status.meal === "hungry" },
    { key: "potty", art: species === "cat" ? "owner/potty-scoop" : "owner/potty-bags", ground: tokens.color.blockPeach, label: "Potty", value: pottyText, warn: status.potty === "due" },
  ];
  if (species === "dog") {
    rows.push({ key: "walks", art: "owner/walk-leash", ground: tokens.color.blockButter, label: "Walks", value: status.walkMinutes > 0 ? `${status.walkMinutes} min today` : "Not yet" });
  }
  return rows;
}

/**
 * The top of the Pet room tab (Mook's room trial R1+, Oct 27): the room, then the same story in words (name, mood
 * Tag, one sentence, when it was last updated), the pet's own stat tiles in Today's style, and the next task.
 */
export function OwnerPetRoom({ pet }: { pet: Pet }) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { status, event, updatedAt, latest } = usePetRoom(pet.id);
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
      {/* Nothing logged yet: the sentence already says so, so no card of empty rows. */}
      {status && logged(status) ? (
        <View style={styles.card} testID="pet-status">
          {petRows(status, pet.species, latest).map((row, i) => (
            <View key={row.key} style={[styles.row, i > 0 && styles.rowLine]} testID={`pet-status-${row.key}`}>
              <View style={[styles.rowArt, { backgroundColor: row.warn ? tokens.color.warningSurface : row.ground }, row.warn && styles.rowArtWarn]}>
                <Art name={row.art} size={30} />
              </View>
              <Text style={styles.rowLabel}>{row.label}</Text>
              <Text style={[styles.rowValue, row.warn && styles.rowValueWarn]}>{row.value}</Text>
            </View>
          ))}
        </View>
      ) : null}
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
    // The pet's day: one quiet card, a row per thing (DESIGN.md list rows).
    card: { borderRadius: theme.radius.lg, borderWidth: 1, borderColor: theme.color.border, backgroundColor: theme.color.surface },
    row: { flexDirection: "row", alignItems: "center", gap: theme.spacing.md, minHeight: 56, paddingVertical: theme.spacing.sm, paddingHorizontal: theme.spacing.md },
    rowLine: { borderTopWidth: 1, borderTopColor: theme.color.border },
    rowArt: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
    rowArtWarn: { borderWidth: 1.5, borderColor: tokens.color.warning },
    rowLabel: { flex: 1, fontSize: theme.fontSize.body, lineHeight: theme.lineHeight.body, fontWeight: theme.fontWeight.semibold, color: theme.color.text },
    rowValue: { flexShrink: 1, textAlign: "right", fontSize: theme.fontSize.small + 1, lineHeight: 18, fontWeight: theme.fontWeight.semibold, color: theme.color.textMuted },
    rowValueWarn: { color: tokens.color.warning },
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
