import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { UploadError, deliveryUrl, uploadMedia } from "../../lib/cloudinary";
import { FALLBACK_CAPTION, createFeedPost } from "../../lib/feed";
import { Button } from "../../components/ui/Button";
import { ChipSuggestions, ChipsReading } from "../../components/ChipSuggestions";
import { scrollIntoView } from "../../lib/scrollIntoView";
import { pickMedia } from "../../lib/media";
import { useErrorDialog } from "../../providers/ErrorDialogProvider";
import { useSession } from "../../providers/SessionProvider";
import { useThemedStyles } from "../../providers/ThemeProvider";
import { useToast } from "../../providers/ToastProvider";
import { Theme } from "../../theme/themes";
import { appToday } from "../schedule/dates";
import { type DecorItem, saveDecor } from "../snap/decorApi";
import { DecoratedReport, PHOTO_ASPECT } from "../snap/DecoratedReport";
import { type ChipPhoto, REPORT_BODY_MAX, type ReportChip, addOwnerEntry, generateOwnerEntry, setDiaryPagePhotos, suggestPhotoChips } from "./reportApi";

/** The most photos on a page (015x). */
const MAX_PAGE_PHOTOS = 4;

type PagePhoto = { mediaId: string; url: string };

export type SaveBar = { label: string; disabled: boolean; onPress: () => void };

type Props = {
  pets: { id: string; name: string; species: "dog" | "cat" }[];
  /** The pet the page is about (the Diary's dropdown picks it). */
  petId: string | null;
  /** Tells the Diary which Save page to pin at the bottom of the screen (the sitter's Send sits there too). */
  onSaveBar: (bar: SaveBar | null) => void;
  /** The page is saved: the new page's id. */
  onSaved: (reportId: string, petId: string) => void;
  /** Something is typed: the Diary asks before it drops the page. */
  onDirty?: (dirty: boolean) => void;
};

/**
 * The owner's own diary page (014p, #186), written on the Diary screen like the sitter's: write on the page, add up to
 * four photos if you like (the first is the main one, a tap on the picture box offers Add and Remove, and each photo
 * brings a few short lines that go onto the page when tapped), save. The page is sent to the owner's book at once (no
 * notice, the sitter never sees it). The photos are also kept in Feed, private. Stickers go on while writing and are
 * saved with the page.
 */
export function OwnerEntryPage({ pets, petId, onSaveBar, onSaved, onDirty }: Props) {
  const styles = useThemedStyles(makeStyles);
  const toast = useToast();
  const errorDialog = useErrorDialog();
  const [body, setBody] = useState("");
  const [photos, setPhotos] = useState<PagePhoto[]>([]);
  /** Add and Remove show over the photo after a tap on it. */
  const [photoMenu, setPhotoMenu] = useState(false);
  /** Lines the photos suggest. All are kept to start with; a tap turns one off (like the sitter's chips). */
  const [chips, setChips] = useState<ReportChip[]>([]);
  /** What the vision model said about each photo (it goes into the AI page, unless a chip of that photo is off). */
  const [descriptions, setDescriptions] = useState<ChipPhoto[]>([]);
  /** Photos whose chips are still being made (a spinner shows meanwhile). */
  const [reading, setReading] = useState(0);
  const [off, setOff] = useState<Set<string>>(new Set());
  const [writing, setWriting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [stickers, setStickers] = useState<DecorItem[]>([]);
  const session = useSession();
  const me = session.status === "signedIn" ? session.profile.id : null;
  const [saving, setSaving] = useState(false);

  // A photo belongs to one pet: another pet starts without them.
  useEffect(() => {
    setPhotos([]);
    setChips([]);
    setDescriptions([]);
    setOff(new Set());
    setPhotoMenu(false);
  }, [petId]);

  const pet = pets.find((p) => p.id === petId) ?? null;

  // A photo goes up as it is picked (its chips need it), and shows in the page's picture box once it is there.
  const addPhoto = async () => {
    setPhotoMenu(false);
    if (!pet || uploading || photos.length >= MAX_PAGE_PHOTOS) return;
    const picked = await pickMedia({ purpose: "feed", mediaTypes: ["image"], frame: PHOTO_ASPECT });
    if (!picked) return;
    setUploading(true);
    try {
      const up = await uploadMedia({ petId: pet.id, purpose: "feed", file: picked.file, trim: picked.trim, resourceType: "image" });
      // Shown as it was framed: the whole picture, not the square thumbnail.
      setPhotos((now) => [...now, { mediaId: up.mediaId, url: deliveryUrl(up.publicId, 900) || up.secureUrl || up.thumbUrl }]);
      // The chips are a bonus: a photo that cannot be read just brings none.
      setReading((n) => n + 1);
      void suggestPhotoChips(pet.id, [up.mediaId])
        .then((found) => {
          setChips((now) => [...now, ...found.chips]);
          setDescriptions((now) => [...now, ...found.photos]);
        })
        .catch(() => undefined)
        .finally(() => setReading((n) => n - 1));
    } catch (error) {
      errorDialog.show({ title: "Photo not added", message: error instanceof UploadError || error instanceof Error ? error.message : "Try again." });
    } finally {
      setUploading(false);
    }
  };

  const removePhoto = (index: number) => {
    const gone = photos[index];
    setPhotos((now) => now.filter((_, i) => i !== index));
    // Its lines go with it.
    if (gone) {
      setChips((now) => now.filter((c) => c.media_id !== gone.mediaId));
      setDescriptions((now) => now.filter((d) => d.media_id !== gone.mediaId));
    }
    setPhotoMenu(false);
  };

  // Chips that have just been made are scrolled into sight (they land below the page, often under the fold).
  const chipsRef = useRef<View>(null);
  const wasReading = useRef(false);
  useEffect(() => {
    const now = reading > 0;
    if (wasReading.current && !now && chips.length > 0) setTimeout(() => scrollIntoView(chipsRef), 50);
    wasReading.current = now;
  }, [reading, chips.length]);

  const toggleChip = (id: string) =>
    setOff((now) => {
      const next = new Set(now);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // "Write the page from the chips": the kept chips and what is already on the page become the page's words.
  const kept = chips.filter((c) => !off.has(c.id));
  const canWrite = !!pet && !writing && (kept.length > 0 || descriptions.length > 0 || body.trim() !== "");
  const writeFromChips = async () => {
    if (!pet || writing) return;
    setWriting(true);
    try {
      // A photo with any chip turned off sends no description: it could say what that chip said.
      const photoLines = descriptions.filter((d) => !chips.some((c) => c.media_id === d.media_id && off.has(c.id))).map((d) => d.description);
      const res = await generateOwnerEntry(pet.id, kept.map((c) => c.label), photoLines, body.trim() || null);
      setBody(res.body.slice(0, REPORT_BODY_MAX));
      if (res.fallback) toast.show("The writing helper is down. Here's a plain list to edit.");
    } catch (error) {
      errorDialog.show({ title: "Page not written", message: (error as Error).message, onRetry: () => void writeFromChips() });
    } finally {
      setWriting(false);
    }
  };

  // The picture box is the photo button (#369): empty, it opens the picker; with photos, Add and Remove (the one showing).
  const picturePress =
    photos.length > 0
      ? {
          onPress: () => setPhotoMenu((open) => !open),
          label: "Change the photos",
          testID: "diary-write-photo-change",
          actions: (index: number) =>
            photoMenu ? (
              <>
                {photos.length < MAX_PAGE_PHOTOS ? <PhotoAction label="Add" onPress={() => void addPhoto()} testID="diary-write-photo-add" /> : null}
                <PhotoAction label="Remove" onPress={() => removePhoto(index)} testID="diary-write-photo-remove" />
              </>
            ) : undefined,
        }
      : { onPress: () => void addPhoto(), label: "Add a photo", testID: "diary-write-photo" };

  const save = async () => {
    if (!pet || saving) return;
    setSaving(true);
    try {
      const reportId = await addOwnerEntry(pet.id, body);
      if (photos.length > 0) {
        try {
          await setDiaryPagePhotos(reportId, photos.map((p) => p.mediaId));
          for (const photo of photos) {
            await createFeedPost({
              petId: pet.id,
              mediaId: photo.mediaId,
              caption: FALLBACK_CAPTION,
              captionSource: "fallback",
              role: "owner",
              visibility: "private",
            });
          }
        } catch {
          toast.show("Page saved, but the photos weren't added.");
        }
      }
      if (stickers.length > 0 && me) {
        try {
          await saveDecor(reportId, me, stickers);
        } catch {
          toast.show("Page saved, but the stickers weren't.");
        }
      }
      toast.show("Page saved");
      onSaved(reportId, pet.id);
    } catch (error) {
      errorDialog.show({
        title: "Page not saved",
        message: error instanceof UploadError || error instanceof Error ? error.message : "Couldn't save the page. Try again.",
        onRetry: () => void save(),
      });
    } finally {
      setSaving(false);
    }
  };

  const dirty = body.trim() !== "";
  useEffect(() => {
    onDirty?.(dirty);
  }, [dirty, onDirty]);
  const saveRef = useRef(save);
  saveRef.current = save;
  const barLabel = saving ? "Saving…" : "Save page";
  const barDisabled = saving || uploading || !dirty;
  useEffect(() => {
    onSaveBar({ label: barLabel, disabled: barDisabled, onPress: () => void saveRef.current() });
    return () => onSaveBar(null);
  }, [barLabel, barDisabled, onSaveBar]);

  return (
    <View style={styles.page}>
      {pet ? (
        <DecoratedReport
          reportId={null}
          petId={pet.id}
          petName={pet.name}
          day={appToday()}
          body={body}
          pictureUrl={photos[0]?.url ?? null}
          pictureUrls={photos.map((p) => p.url)}
          testID="diary-write-page"
          pending={{ items: stickers, onChange: setStickers }}
          picturePress={saving || uploading ? undefined : picturePress}
          writing={{ onChangeText: setBody, placeholder: "Dear diary, today…", maxLength: REPORT_BODY_MAX, disabled: saving, testID: "diary-write-body" }}
        />
      ) : null}
      {/* Right under the page, like the sitter's: the AI writes it from the photos, the chips and the words on it. */}
      <Button
        label={writing ? "Writing…" : body.trim() ? "Rewrite the page with AI" : "Write the page with AI"}
        ai
        variant="secondary"
        onPress={() => void writeFromChips()}
        disabled={!canWrite || saving}
        testID="diary-write-generate"
      />
      {reading > 0 ? <ChipsReading testID="diary-write-chips-reading" /> : null}
      {chips.length > 0 ? (
        <View ref={chipsRef} testID="diary-write-chips">
          <ChipSuggestions chips={chips} off={off} onToggle={toggleChip} testIDPrefix="diary-write-chip" />
        </View>
      ) : null}
    </View>
  );
}

function PhotoAction({ label, onPress, testID }: { label: string; onPress: () => void; testID: string }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.action} testID={testID}>
      <Text style={styles.actionLabel}>{label}</Text>
    </Pressable>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    action: {
      minHeight: 36,
      paddingHorizontal: theme.spacing.md,
      justifyContent: "center",
      borderRadius: theme.radius.pill,
      backgroundColor: theme.color.surface,
      borderWidth: 1,
      borderColor: theme.color.border,
    },
    page: { gap: theme.spacing.md },
    actionLabel: { fontSize: theme.fontSize.body, fontWeight: theme.fontWeight.semibold, color: theme.color.text },
  });
