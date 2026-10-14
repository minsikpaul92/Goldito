import { router } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  GestureResponderEvent,
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { Button } from "../../components/ui/Button";
import { EmptyState } from "../../components/ui/EmptyState";
import { LoadingView } from "../../components/ui/LoadingView";
import { Screen } from "../../components/ui/Screen";
import { Sheet } from "../../components/ui/Sheet";
import { TextButton } from "../../components/ui/TextButton";
import { deliveryUrl, downloadUrl, uploadMedia } from "../../lib/cloudinary";
import { pickMedia } from "../../lib/media";
import { useErrorDialog } from "../../providers/ErrorDialogProvider";
import { useSession } from "../../providers/SessionProvider";
import { useThemedStyles } from "../../providers/ThemeProvider";
import { useToast } from "../../providers/ToastProvider";
import { Theme } from "../../theme/themes";
import { Sticker, coverage, makeSticker, segmentAt } from "./cutout";
import { downloadBlob, downloadFromUrl, stickerFilename } from "./download";
import { PetChips, PetsState, Role, SnapPets } from "./SnapPets";
import { PetSticker, deleteSticker, listStickers, saveSticker } from "./stickerApi";
import { detectPets, loadFrames } from "./vision";

type Step = "preparing" | "cutting" | "saving";
type Photo = { frame: HTMLCanvasElement; url: string; aspect: number };
type Point = { x: number; y: number };

const BUSY: Record<Step, string> = {
  preparing: "Finding your pet…",
  cutting: "Cutting out your pet… (a few seconds)",
  saving: "Saving the sticker…",
};
/** A mask this small or this big did not catch one pet. */
const MIN_COVER = 0.005;
const MAX_COVER = 0.95;
const MISSED = "We couldn't cut out a pet there — tap your pet.";

/**
 * Snap → Sticker (Phase 12.3a, D61): pick a photo → the biggest pet is found (MediaPipe box) and cut out under its
 * centre (Magic Touch, in a Web Worker) → a transparent PNG with a white outline → Save sticker uploads only that PNG
 * and adds it to the pet's sticker box, which the owner and the sitter both see. Tapping elsewhere on the photo cuts
 * again there. Diary decorating with these stickers is 12.3b. Web only.
 */
export function StickerScreen({ role }: { role: Role }) {
  if (Platform.OS !== "web") {
    return (
      <Screen>
        <EmptyState emoji="✂️" title="Sticker" message="Stickers work in the web app for now." />
      </Screen>
    );
  }
  return <SnapPets role={role}>{(pets) => <StickerMaker role={role} pets={pets} />}</SnapPets>;
}

function StickerMaker({ role, pets }: { role: Role; pets: PetsState }) {
  const styles = useThemedStyles(makeStyles);
  const errorDialog = useErrorDialog();
  const toast = useToast();
  const session = useSession();
  const me = session.status === "signedIn" ? session.profile.id : null;
  const photoRef = useRef<View>(null);

  const [petId, setPetId] = useState<string | null>(null);
  const [step, setStep] = useState<Step | null>(null);
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [point, setPoint] = useState<Point | null>(null);
  const [sticker, setSticker] = useState<Sticker | null>(null);
  const [missed, setMissed] = useState(false);
  const [box, setBox] = useState<PetSticker[]>([]);
  const [deleting, setDeleting] = useState<PetSticker | null>(null);

  const onlyPet = pets.status === "ready" && pets.pets.length === 1 ? pets.pets[0].id : null;
  useEffect(() => {
    if (onlyPet) setPetId(onlyPet);
  }, [onlyPet]);

  const loadBox = useCallback(async (id: string) => {
    try {
      setBox(await listStickers(id));
    } catch {
      setBox([]); // the box is a bonus; making a sticker works without it
    }
  }, []);

  useEffect(() => {
    if (petId) void loadBox(petId);
    else setBox([]);
  }, [petId, loadBox]);

  const cut = async (current: Photo, at: Point) => {
    setPoint(at);
    setMissed(false);
    setSticker(null);
    setStep("cutting");
    try {
      const mask = await segmentAt(current.frame, at);
      const share = coverage(mask);
      if (share < MIN_COVER || share > MAX_COVER) {
        setMissed(true);
        return;
      }
      setSticker(await makeSticker(current.frame, mask));
    } catch (error) {
      const message = (error as Error).message;
      if (message === MISSED) {
        setMissed(true);
      } else {
        errorDialog.show({
          title: "Sticker not made",
          message: "Couldn't cut out your pet right now. Check your connection and try again.",
          onRetry: () => void cut(current, at),
        });
      }
    } finally {
      setStep(null);
    }
  };

  const pickPhoto = async () => {
    if (step) return;
    const picked = await pickMedia({ purpose: "sticker", mediaTypes: ["image"] });
    if (!picked) return;
    setSticker(null);
    setMissed(false);
    setPoint(null);
    setStep("preparing");
    let current: Photo | null = null;
    let start: Point = { x: 0.5, y: 0.5 };
    try {
      const [frame] = await loadFrames(picked.file);
      current = { frame, url: frame.toDataURL("image/jpeg", 0.85), aspect: frame.width / frame.height };
      setPhoto(current);
      // The biggest pet, tapped at its centre — like a long press on the pet. No pet found: the middle.
      const found = await detectPets(frame);
      const biggest = [...found].sort((a, b) => b.w * b.h - a.w * a.h)[0];
      if (biggest) start = { x: biggest.x + biggest.w / 2, y: biggest.y + biggest.h / 2 };
    } catch {
      setStep(null);
      errorDialog.show({
        title: "Sticker not made",
        message: "Couldn't get the pet finder ready. Check your connection and try again.",
      });
      return;
    }
    if (current) await cut(current, start);
  };

  const onTapPhoto = (event: GestureResponderEvent) => {
    if (!photo || step) return;
    const node = photoRef.current as unknown as HTMLElement | null;
    if (!node?.getBoundingClientRect) return;
    const rect = node.getBoundingClientRect();
    const { pageX, pageY } = event.nativeEvent;
    const x = (pageX - window.scrollX - rect.left) / rect.width;
    const y = (pageY - window.scrollY - rect.top) / rect.height;
    if (x < 0 || x > 1 || y < 0 || y > 1) return;
    void cut(photo, { x, y });
  };

  const save = async () => {
    if (!sticker || !petId || !me || step) return;
    setStep("saving");
    try {
      const file = new File([sticker.blob], "sticker.png", { type: "image/png" });
      const uploaded = await uploadMedia({ petId, purpose: "sticker", file, resourceType: "image" });
      await saveSticker(petId, uploaded.mediaId, me);
      toast.show("Sticker saved ✂️");
      setSticker(null);
      setPhoto(null);
      setPoint(null);
      await loadBox(petId);
    } catch (error) {
      errorDialog.show({ title: "Sticker not saved", message: (error as Error).message, onRetry: () => void save() });
    } finally {
      setStep(null);
    }
  };

  const confirmDelete = async () => {
    if (!deleting || !petId) return;
    const target = deleting;
    try {
      await deleteSticker(target.id);
      setDeleting(null);
      setBox((list) => list.filter((s) => s.id !== target.id));
      toast.show("Sticker deleted");
    } catch (error) {
      errorDialog.show({ title: "Not deleted", message: (error as Error).message });
    }
  };

  if (pets.status === "loading") return <LoadingView />;
  const petList = pets.status === "ready" ? pets.pets : [];
  if (petList.length === 0) {
    return (
      <Screen>
        <View testID="sticker-no-pets">
          {role === "sitter" ? (
            <EmptyState emoji="✂️" title="No pet in your care right now" message="Make stickers of the pets you look after, while their stay is on." />
          ) : (
            <EmptyState
              emoji="✂️"
              title="Add a pet first"
              message="Pick a photo of your pet and we'll cut them out as a sticker for the diary."
              action={{ label: "Add pet", onPress: () => router.push("/owner/pets/new") }}
            />
          )}
        </View>
      </Screen>
    );
  }

  const ready = !!sticker && !step;
  const petName = petList.find((p) => p.id === petId)?.name ?? "pet";
  const fileName = stickerFilename(petName);

  return (
    <Screen contentStyle={styles.content} testID="sticker">
      <View style={styles.section}>
        <Text style={styles.label}>{role === "sitter" ? "Which pet in your care?" : "Whose sticker?"}</Text>
        <PetChips
          pets={petList}
          selectedId={petId}
          onSelect={(id) => id && setPetId(id)}
          disabled={!!step}
          testIDPrefix="sticker-pet"
        />
      </View>

      {photo ? (
        <View style={styles.section}>
          <Pressable
            ref={photoRef}
            accessibilityRole="button"
            accessibilityLabel="Tap your pet to cut it out"
            onPress={onTapPhoto}
            disabled={!!step}
            style={[styles.photo, { aspectRatio: photo.aspect }]}
            testID="sticker-photo"
          >
            <Image source={{ uri: photo.url }} style={StyleSheet.absoluteFill} resizeMode="cover" />
            {point ? (
              <View
                pointerEvents="none"
                style={[styles.dot, { left: `${point.x * 100}%` as `${number}%`, top: `${point.y * 100}%` as `${number}%` }]}
                testID="sticker-dot"
              />
            ) : null}
          </Pressable>
          <Text style={styles.hint}>Tap your pet if we picked the wrong thing.</Text>
        </View>
      ) : null}

      {step ? (
        <View style={styles.busy} testID="sticker-busy">
          <ActivityIndicator />
          <Text style={styles.busyText} testID="sticker-busy-text">
            {BUSY[step]}
          </Text>
        </View>
      ) : null}

      {missed && !step ? (
        <Text style={styles.missed} testID="sticker-missed">
          {MISSED}
        </Text>
      ) : null}

      {sticker && step !== "cutting" ? (
        <View style={styles.previewWrap}>
          <Image
            source={{ uri: sticker.dataUrl }}
            style={[styles.preview, { aspectRatio: sticker.width / sticker.height }]}
            resizeMode="contain"
            testID="sticker-preview"
          />
        </View>
      ) : null}

      {ready ? (
        <>
          <Button label="Save sticker" onPress={() => void save()} disabled={!petId || !me} testID="sticker-save" />
          <TextButton label="⬇ Download sticker" onPress={() => sticker && downloadBlob(sticker.blob, fileName)} testID="sticker-download" />
          <TextButton label="Pick another photo" onPress={() => void pickPhoto()} testID="sticker-pick-again" />
        </>
      ) : (
        <Button
          label={photo ? "Pick another photo" : "Pick a photo"}
          onPress={() => void pickPhoto()}
          disabled={!!step || !petId}
          testID="sticker-pick"
        />
      )}

      <View style={styles.section} testID="sticker-box">
        <Text style={styles.label}>Sticker box</Text>
        {box.length === 0 ? (
          <Text style={styles.hint} testID="sticker-box-empty">
            No stickers yet — saved stickers show up here for both of you.
          </Text>
        ) : (
          <View style={styles.grid}>
            {box.map((s) => (
              <View key={s.id} style={styles.tile} testID="sticker-tile">
                {deliveryUrl(s.publicId, 300) ? (
                  <Image source={{ uri: deliveryUrl(s.publicId, 300) }} style={styles.tileImage} resizeMode="contain" />
                ) : (
                  <Text style={styles.tileEmoji}>🐾</Text>
                )}
                {downloadUrl(s.publicId, fileName) ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Download sticker"
                    onPress={() => downloadFromUrl(downloadUrl(s.publicId, fileName.replace(/\.png$/, "")), fileName)}
                    style={styles.save}
                    testID="sticker-tile-download"
                  >
                    <Text style={styles.removeLabel}>⬇</Text>
                  </Pressable>
                ) : null}
                {s.createdBy === me ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Delete sticker"
                    onPress={() => setDeleting(s)}
                    style={styles.remove}
                    testID="sticker-delete"
                  >
                    <Text style={styles.removeLabel}>×</Text>
                  </Pressable>
                ) : null}
              </View>
            ))}
          </View>
        )}
      </View>

      <Sheet visible={!!deleting} title="Delete this sticker?" onClose={() => setDeleting(null)} testID="sticker-delete-sheet"
        footer={<Button label="Delete sticker" variant="danger" onPress={() => void confirmDelete()} testID="sticker-delete-confirm" />}
      >
        <Text style={styles.hint}>It leaves the sticker box. Diary pages it already decorates keep it.</Text>
      </Sheet>
    </Screen>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    content: { gap: theme.spacing.md },
    section: { gap: theme.spacing.sm },
    label: { fontSize: theme.fontSize.small, fontWeight: "600", color: theme.color.textMuted },
    hint: { fontSize: theme.fontSize.small, color: theme.color.textMuted },
    photo: { width: "100%", borderRadius: theme.radius.md, overflow: "hidden", backgroundColor: theme.color.border },
    dot: {
      position: "absolute",
      width: 16,
      height: 16,
      marginLeft: -8,
      marginTop: -8,
      borderRadius: 8,
      borderWidth: 3,
      borderColor: theme.color.surface,
      backgroundColor: theme.color.primary,
    },
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
    missed: { fontSize: theme.fontSize.body, color: theme.color.text },
    previewWrap: {
      alignItems: "center",
      padding: theme.spacing.md,
      borderRadius: theme.radius.lg,
      backgroundColor: theme.color.accent,
    },
    preview: { width: "70%" },
    grid: { flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.sm },
    tile: {
      width: 96,
      height: 96,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: theme.radius.md,
      backgroundColor: theme.color.accent,
    },
    tileImage: { width: 84, height: 84 },
    tileEmoji: { fontSize: theme.icon.md },
    save: {
      position: "absolute",
      bottom: 2,
      right: 2,
      width: 24,
      height: 24,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.color.surface,
    },
    remove: {
      position: "absolute",
      top: 2,
      right: 2,
      width: 24,
      height: 24,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.color.surface,
    },
    removeLabel: { fontSize: theme.fontSize.body, fontWeight: "700", color: theme.color.text },
  });
