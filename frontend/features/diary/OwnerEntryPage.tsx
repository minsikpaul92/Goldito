import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { UploadError, uploadMedia } from "../../lib/cloudinary";
import { FALLBACK_CAPTION, createFeedPost } from "../../lib/feed";
import { pickMedia } from "../../lib/media";
import { useErrorDialog } from "../../providers/ErrorDialogProvider";
import { useSession } from "../../providers/SessionProvider";
import { useThemedStyles } from "../../providers/ThemeProvider";
import { useToast } from "../../providers/ToastProvider";
import { Theme } from "../../theme/themes";
import { appToday } from "../schedule/dates";
import { type DecorItem, saveDecor } from "../snap/decorApi";
import { DecoratedReport, PHOTO_ASPECT } from "../snap/DecoratedReport";
import { REPORT_BODY_MAX, addOwnerEntry, setDiaryPagePhotos, suggestPhotoChips } from "./reportApi";

/** The most photos on a page (015x). */
const MAX_PAGE_PHOTOS = 4;

type PagePhoto = { mediaId: string; url: string };
type PhotoChip = { id: string; label: string };

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
  /** Lines the photos suggest; one that was tapped is on the page and leaves the list. */
  const [chips, setChips] = useState<PhotoChip[]>([]);
  const [uploading, setUploading] = useState(false);
  const [stickers, setStickers] = useState<DecorItem[]>([]);
  const session = useSession();
  const me = session.status === "signedIn" ? session.profile.id : null;
  const [saving, setSaving] = useState(false);

  // A photo belongs to one pet: another pet starts without them.
  useEffect(() => {
    setPhotos([]);
    setChips([]);
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
      setPhotos((now) => [...now, { mediaId: up.mediaId, url: up.thumbUrl }]);
      // The chips are a bonus: a photo that cannot be read just brings none.
      void suggestPhotoChips(pet.id, [up.mediaId])
        .then((found) => setChips((now) => [...now, ...found.map((c) => ({ id: c.id, label: c.label }))]))
        .catch(() => undefined);
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
    if (gone) setChips((now) => now.filter((c) => !c.id.startsWith(`photo-${gone.mediaId}-`)));
    setPhotoMenu(false);
  };

  // A tapped chip goes onto the page as a line of its own.
  const putChip = (chip: PhotoChip) => {
    setBody((now) => {
      const next = now.trim() ? `${now.replace(/\s+$/, "")}\n${chip.label}.` : `${chip.label}.`;
      return next.slice(0, REPORT_BODY_MAX);
    });
    setChips((now) => now.filter((c) => c.id !== chip.id));
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
      {chips.length > 0 ? (
        <View style={styles.chips} testID="diary-write-chips">
          {chips.map((chip) => (
            <Pressable key={chip.id} accessibilityRole="button" onPress={() => putChip(chip)} style={styles.action} testID={`diary-write-chip-${chip.id}`}>
              <Text style={styles.actionLabel}>{chip.label}</Text>
            </Pressable>
          ))}
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
    chips: { flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.sm },
    actionLabel: { fontSize: theme.fontSize.body, fontWeight: theme.fontWeight.semibold, color: theme.color.text },
  });
