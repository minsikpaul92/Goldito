import { useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Image, Platform, Pressable, StyleSheet, Text, View } from "react-native";

import { PetMoodFace } from "../../components/pet/PetMoodFace";
import { Button } from "../../components/ui/Button";
import { EmptyState } from "../../components/ui/EmptyState";
import { LoadingView } from "../../components/ui/LoadingView";
import { Screen } from "../../components/ui/Screen";
import { Sheet } from "../../components/ui/Sheet";
import { TextButton } from "../../components/ui/TextButton";
import { ApiError } from "../../lib/api";
import { pickMedia } from "../../lib/media";
import { EMOTION_FACE } from "../pets/sprites/moodFaces";
import { usePetLook } from "../pets/usePetLook";
import { useErrorDialog } from "../../providers/ErrorDialogProvider";
import { useThemedStyles } from "../../providers/ThemeProvider";
import { Theme } from "../../theme/themes";
import { EMOTIONS, Emotion, MoodFrame, MoodResult, readMood } from "./moodApi";
import { PetChips, PetOption, PetsState, Role, SnapPets } from "./SnapPets";
import { PetBox, cropPet, detectPets, loadFrames } from "./vision";

type Step = "preparing" | "finding" | "reading";
type Shown = { result: MoodResult; images: string[]; aspects: number[] };

const DISCLAIMER = "For fun only, not a health check.";
const NO_PET = "We couldn't find a pet. Try a clearer photo.";
/** The API takes ≤ 8 crops: up to 4 pets in a photo, 2 per frame in a clip (4 frames). */
const PETS_IN_PHOTO = 4;
const PETS_IN_CLIP = 2;

const pct = (fraction: number): `${number}%` => `${fraction * 100}%`;

const LABELS: Record<Emotion, string> = {
  happy: "Happy",
  relaxed: "Relaxed",
  excited: "Excited",
  curious: "Curious",
  sleepy: "Sleepy",
  anxious: "Anxious",
  angry: "Angry",
  sad: "Sad",
};

/** The bars shown before See all (Oct 27 call: the answer first). */
const TOP_ROWS = 3;

const BUSY: Record<Step, string> = {
  preparing: "Getting your photo ready…",
  finding: "Finding your pet…",
  reading: "Reading the mood…",
};

/**
 * Snap → Mood (Phase 12.2b, D61 — for fun only): pick a photo or a short clip → MediaPipe boxes each pet in the
 * browser → the crops go to `POST /api/ai/pet-mood` → the answer first (Oct 27 call, design site `collab-1027` item 3
 * P1): the pet's tamagotchi face for its top mood with the one-line summary and the photo as a thumbnail, then the top
 * three of the eight emotions (server percentages, sum 100), the rest behind See all. With more than one pet the
 * picture stays big, a box per pet, so you can tell them apart. A clip uses four frames and shows the most typical
 * one. Nothing is saved.
 */
export function MoodScreen({ role }: { role: Role }) {
  if (Platform.OS !== "web") {
    return (
      <Screen>
        <EmptyState icon="moodHappy" title="Mood" message="Mood works in the web app for now." />
      </Screen>
    );
  }
  return <SnapPets role={role}>{(pets) => <Mood role={role} pets={pets} />}</SnapPets>;
}

function Mood({ role, pets }: { role: Role; pets: PetsState }) {
  const styles = useThemedStyles(makeStyles);
  const errorDialog = useErrorDialog();
  // The Snap tab passes the pet it had picked (`?pet=`).
  const { pet: petParam } = useLocalSearchParams<{ pet?: string }>();
  const [petId, setPetId] = useState<string | null>(petParam ?? null);
  const [step, setStep] = useState<Step | null>(null);
  const [shown, setShown] = useState<Shown | null>(null);
  const [selected, setSelected] = useState(0);
  const [noPet, setNoPet] = useState(false);

  // One pet → named already (the owner can tap it off for a photo of someone else's pet).
  const onlyPet = pets.status === "ready" && pets.pets.length === 1 ? pets.pets[0].id : null;
  useEffect(() => {
    if (onlyPet) setPetId(onlyPet);
  }, [onlyPet]);

  const send = async (forPet: string | null, frames: MoodFrame[], images: string[], aspects: number[]) => {
    setStep("reading");
    try {
      const result = await readMood(forPet, frames);
      setSelected(0);
      setShown({ result, images, aspects });
    } catch (error) {
      if (error instanceof ApiError && error.status === 422) {
        setNoPet(true);
      } else {
        errorDialog.show({
          title: "Mood not read",
          message: (error as Error).message || "Couldn't read the mood. Try again.",
          onRetry: () => void send(forPet, frames, images, aspects),
        });
      }
    } finally {
      setStep(null);
    }
  };

  const analyze = async () => {
    if (step) return;
    const picked = await pickMedia({ purpose: "mood", mediaTypes: ["image", "video"] });
    if (!picked) return;
    setShown(null);
    setNoPet(false);
    let canvases: HTMLCanvasElement[] = [];
    const boxes: PetBox[][] = [];
    try {
      setStep("preparing");
      canvases = await loadFrames(picked.file, picked.trim);
      setStep("finding");
      for (const canvas of canvases) boxes.push(await detectPets(canvas)); // one at a time: the detector runs on the CPU
    } catch (error) {
      setStep(null);
      errorDialog.show({
        title: "Mood not read",
        message: (error as Error).message?.startsWith("Couldn't")
          ? (error as Error).message
          : "Couldn't get the pet finder ready. Check your connection and try again.",
      });
      return;
    }
    const perFrame = canvases.length > 1 ? PETS_IN_CLIP : PETS_IN_PHOTO;
    const frames: MoodFrame[] = canvases
      .map((canvas, index) => ({
        index,
        crops: boxes[index].slice(0, perFrame).map((b) => ({ box: { x: b.x, y: b.y, w: b.w, h: b.h }, image: cropPet(canvas, b) })),
      }))
      .filter((frame) => frame.crops.length > 0);
    if (frames.length === 0) {
      setStep(null);
      setNoPet(true);
      return;
    }
    const images = canvases.map((canvas) => canvas.toDataURL("image/jpeg", 0.85));
    const aspects = canvases.map((canvas) => canvas.width / canvas.height);
    await send(petId, frames, images, aspects);
  };

  if (pets.status === "loading") return <LoadingView />;

  const petList = pets.status === "ready" ? pets.pets : [];
  const namedPet = petList.find((p) => p.id === petId) ?? null;

  return (
    <Screen contentStyle={styles.content} testID="mood">
      {petList.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.label}>{role === "sitter" ? "Which pet in your care? (optional)" : "Whose photo? (optional)"}</Text>
          <PetChips
            pets={petList}
            selectedId={petId}
            onSelect={setPetId}
            disabled={!!step}
            optional
            testIDPrefix="mood-pet-id"
          />
        </View>
      ) : null}

      {step ? (
        <View style={styles.busy} testID="mood-busy">
          <ActivityIndicator />
          <Text style={styles.busyText} testID="mood-busy-text">
            {BUSY[step]}
          </Text>
        </View>
      ) : null}

      {noPet && !step ? (
        <Text style={styles.noPet} testID="mood-no-pet">
          {NO_PET}
        </Text>
      ) : null}

      {shown && !step ? <MoodResultView shown={shown} selected={selected} onSelect={setSelected} pet={namedPet} petList={petList} /> : null}

      <Button
        label={shown || noPet ? "Try another photo" : "Pick a photo or clip"}
        variant={shown ? "secondary" : "primary"}
        onPress={() => void analyze()}
        disabled={!!step}
        testID="mood-pick"
      />

      <Text style={styles.disclaimer} testID="mood-disclaimer">
        {shown?.result.disclaimer ?? DISCLAIMER}
      </Text>
    </Screen>
  );
}

function MoodResultView({
  shown,
  selected,
  onSelect,
  pet: named,
  petList,
}: {
  shown: Shown;
  selected: number;
  onSelect: (index: number) => void;
  /** The pet the photo was named for, if any. */
  pet: PetOption | null;
  petList: PetOption[];
}) {
  const styles = useThemedStyles(makeStyles);
  const [all, setAll] = useState(false);
  const [photoOpen, setPhotoOpen] = useState(false);
  const { breed, look } = usePetLook(named?.id ?? null);
  const { pets } = shown.result;
  const pet = pets[Math.min(selected, pets.length - 1)];
  const many = pets.length > 1;
  const rows = [...EMOTIONS].sort((a, b) => pet.emotions[b] - pet.emotions[a]);
  const tag = (index: number) => (many ? `Pet ${index + 1}` : (named?.name ?? "Your pet"));
  // An unnamed pet takes the face of the kind of pet the person has (a dog when they have both or none).
  const species = named?.species ?? (petList.length > 0 && petList.every((p) => p.species === "cat") ? "cat" : "dog");
  const facePet = { name: many ? tag(selected) : (named?.name ?? "Your pet"), species, breed: named ? breed : null, look: named ? look : null };

  // The frame the server picked for this pet, with every pet's box that is on it.
  const picture = (
    <View style={[styles.picture, { aspectRatio: shown.aspects[pet.frame] ?? 1 }]}>
      <Image source={{ uri: shown.images[pet.frame] }} style={StyleSheet.absoluteFill} resizeMode="cover" testID="mood-image" />
      {pets.map((p, index) =>
        p.frame === pet.frame ? (
          <Pressable
            key={index}
            accessibilityRole="button"
            accessibilityLabel={`${tag(index)}: ${p.top}`}
            onPress={() => onSelect(index)}
            style={[
              styles.box,
              index === selected && styles.boxSelected,
              { left: pct(p.box.x), top: pct(p.box.y), width: pct(p.box.w), height: pct(p.box.h) },
            ]}
            testID={`mood-box-${index}`}
          >
            <Text style={[styles.boxTag, index === selected && styles.boxTagSelected]}>
              {tag(index)} · {p.emotions[p.top]}% {LABELS[p.top].toLowerCase()}
            </Text>
          </Pressable>
        ) : null,
      )}
    </View>
  );

  return (
    <View style={styles.section} testID="mood-result">
      {many ? picture : null}

      {many ? (
        <View style={styles.tabs}>
          {pets.map((p, index) => (
            <Pressable
              key={index}
              accessibilityRole="button"
              aria-pressed={index === selected}
              onPress={() => onSelect(index)}
              style={[styles.tab, index === selected && styles.tabSelected]}
              testID={`mood-pet-${index}`}
            >
              <Text style={styles.tabLabel}>
                {tag(index)} · {LABELS[p.top]}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      <View style={styles.hero} testID="mood-hero">
        <PetMoodFace pet={facePet} mood={EMOTION_FACE[pet.top] ?? "idle"} label={LABELS[pet.top]} size={72} testID="mood-face" />
        <View style={styles.heroText}>
          <Text style={styles.summary} testID="mood-summary">
            {pet.summary}
          </Text>
          <Text style={styles.note}>{`${pet.emotions[pet.top]}% ${LABELS[pet.top].toLowerCase()}`}</Text>
        </View>
        {many ? null : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="See the photo"
            onPress={() => setPhotoOpen(true)}
            style={({ pressed }) => [styles.thumb, pressed && styles.pressed]}
            testID="mood-photo"
          >
            <Image source={{ uri: shown.images[pet.frame] }} style={StyleSheet.absoluteFill} resizeMode="cover" accessibilityIgnoresInvertColors />
          </Pressable>
        )}
      </View>
      {many ? null : (
        <Sheet visible={photoOpen} title="Photo" onClose={() => setPhotoOpen(false)} testID="mood-photo-view">
          {picture}
        </Sheet>
      )}
      {pet.frames_used > 1 ? (
        <Text style={styles.note} testID="mood-frames">
          Average of {pet.frames_used} frames from the clip
        </Text>
      ) : null}

      <View style={styles.table} testID="mood-table">
        {(all ? rows : rows.slice(0, TOP_ROWS)).map((emotion) => {
          const top = emotion === pet.top;
          return (
            <View key={emotion} style={styles.row} testID={`mood-row-${emotion}`}>
              <Text style={[styles.rowLabel, top && styles.rowTop]}>{LABELS[emotion]}</Text>
              <View style={styles.bar}>
                <View style={[styles.fill, top && styles.fillTop, { width: pct(pet.emotions[emotion] / 100) }]} />
              </View>
              <Text style={[styles.rowValue, top && styles.rowTop]} testID={`mood-value-${emotion}`}>
                {pet.emotions[emotion]}%
              </Text>
            </View>
          );
        })}
        <TextButton
          label={all ? "Show the top 3" : `See all ${rows.length}`}
          onPress={() => setAll((v) => !v)}
          style={styles.more}
          testID="mood-more"
        />
      </View>
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    content: { gap: theme.spacing.md },
    section: { gap: theme.spacing.sm },
    label: { fontSize: theme.fontSize.small, fontWeight: theme.fontWeight.semibold, color: theme.color.textMuted },
    busy: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.sm,
      padding: theme.spacing.md,
      borderRadius: theme.radius.md,
      backgroundColor: theme.color.surface,
      borderWidth: 1,
      borderColor: theme.color.border,
    },
    busyText: { fontSize: theme.fontSize.body, color: theme.color.text },
    noPet: { fontSize: theme.fontSize.body, color: theme.color.text },
    picture: {
      width: "100%",
      borderRadius: theme.radius.md,
      overflow: "hidden",
      backgroundColor: theme.color.border,
    },
    box: { position: "absolute", borderWidth: 2, borderColor: theme.color.surface, borderRadius: theme.radius.sm },
    boxSelected: { borderWidth: 3, borderColor: theme.color.primary },
    boxTag: {
      position: "absolute",
      top: -2,
      left: -2,
      paddingHorizontal: theme.spacing.xs,
      fontSize: theme.fontSize.caption,
      fontWeight: theme.fontWeight.semibold,
      color: theme.color.text,
      backgroundColor: theme.color.surface,
    },
    boxTagSelected: { color: theme.color.primaryText, backgroundColor: theme.color.primary },
    tabs: { flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.sm },
    tab: {
      paddingVertical: theme.spacing.xs,
      paddingHorizontal: theme.spacing.sm + 4,
      borderRadius: theme.radius.lg,
      borderWidth: 1,
      borderColor: theme.color.border,
      backgroundColor: theme.color.surface,
    },
    tabSelected: { borderColor: theme.color.primary, backgroundColor: theme.color.accent },
    tabLabel: { fontSize: theme.fontSize.small, color: theme.color.text },
    // The answer first: the face, the line, the photo small.
    hero: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.sm,
      padding: theme.spacing.md,
      borderRadius: theme.radius.lg,
      backgroundColor: theme.color.accent,
    },
    heroText: { flex: 1, minWidth: 0, gap: 2 },
    thumb: { width: 56, height: 56, flexShrink: 0, overflow: "hidden", borderRadius: theme.radius.md, backgroundColor: theme.color.border },
    pressed: { opacity: 0.6 },
    more: { alignSelf: "center" },
    summary: { fontSize: theme.fontSize.body, fontWeight: theme.fontWeight.bold, color: theme.color.text },
    note: { fontSize: theme.fontSize.small, color: theme.color.textMuted },
    table: {
      gap: theme.spacing.xs,
      padding: theme.spacing.md,
      borderRadius: theme.radius.lg,
      borderWidth: 1,
      borderColor: theme.color.border,
      backgroundColor: theme.color.surface,
    },
    row: { flexDirection: "row", alignItems: "center", gap: theme.spacing.sm },
    rowLabel: { width: 104, fontSize: theme.fontSize.small, color: theme.color.text },
    rowValue: { width: 40, textAlign: "right", fontSize: theme.fontSize.small, color: theme.color.textMuted },
    rowTop: { fontWeight: theme.fontWeight.bold, color: theme.color.text },
    bar: { flex: 1, height: 8, borderRadius: 4, backgroundColor: theme.color.background, overflow: "hidden" },
    fill: { height: 8, borderRadius: 4, backgroundColor: theme.color.border },
    fillTop: { backgroundColor: theme.color.primary },
    disclaimer: { fontSize: theme.fontSize.caption, color: theme.color.textMuted, textAlign: "center" },
  });
