import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Button } from "../../components/ui/Button";
import { FeedPetPicker } from "../../components/FeedPetPicker";
import { Sheet } from "../../components/ui/Sheet";
import { UploadError, uploadMedia } from "../../lib/cloudinary";
import { FALLBACK_CAPTION, createFeedPost } from "../../lib/feed";
import { pickMedia } from "../../lib/media";
import { useErrorDialog } from "../../providers/ErrorDialogProvider";
import { useSession } from "../../providers/SessionProvider";
import { useThemedStyles } from "../../providers/ThemeProvider";
import { useToast } from "../../providers/ToastProvider";
import { Theme } from "../../theme/themes";
import { usePetFaces } from "../feed/usePetFaces";
import { appToday } from "../schedule/dates";
import { type DecorItem, saveDecor } from "../snap/decorApi";
import { DecoratedReport } from "../snap/DecoratedReport";
import { REPORT_BODY_MAX, addOwnerEntry, setDiaryPagePhotos, suggestPhotoChips } from "./reportApi";

/** The most photos on a page (015x). */
const MAX_PAGE_PHOTOS = 4;

type PagePhoto = { mediaId: string; url: string };
type PhotoChip = { id: string; label: string };

type Props = {
  visible: boolean;
  pets: { id: string; name: string; species: "dog" | "cat" }[];
  /** Open on this pet (the one the book is showing). */
  initialPetId?: string | null;
  onClose: () => void;
  /** The page is saved: the new page's id. */
  onSaved: (reportId: string, petId: string) => void;
};

/**
 * The owner's own diary page (014p, #186): write on the page, add a photo if you like, save. The page is sent to the
 * owner's book at once (no notice, the sitter never sees it). Up to four photos: the first is the main one, a tap on the
 * picture box offers Add and Remove, and each photo brings a few short lines (chips) that go onto the page when tapped.
 * The photos are also kept in Feed, private.
 * Stickers can go on while writing; they are saved with the page.
 */
export function OwnerEntrySheet({ visible, pets, initialPetId, onClose, onSaved }: Props) {
  const styles = useThemedStyles(makeStyles);
  const toast = useToast();
  const errorDialog = useErrorDialog();
  const [petId, setPetId] = useState<string | null>(null);
  const faces = usePetFaces(pets.map((p) => p.id));
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

  // Each time it opens: an empty page for the pet the book is on.
  useEffect(() => {
    if (!visible) return;
    setPetId(initialPetId && pets.some((p) => p.id === initialPetId) ? initialPetId : (pets[0]?.id ?? null));
    setBody("");
    setPhotos([]);
    setChips([]);
    setPhotoMenu(false);
    setStickers([]);
  }, [visible, initialPetId, pets]);
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
    const picked = await pickMedia({ purpose: "feed", mediaTypes: ["image"] });
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

  return (
    <Sheet
      dirty={body.trim() !== ""}
      discardTitle="Discard your page?"
      visible={visible}
      title="New page"
      headerExtra={
        pets.length > 1 ? (
          <FeedPetPicker groups={[{ key: "mine", pets }]} allPets={[]} value={petId ?? ""} onChange={setPetId} faces={faces} testID="diary-write-pet" />
        ) : undefined
      }
      onClose={onClose}
      scrollbar
      testID="diary-write-sheet"
      footer={<Button label={saving ? "Saving…" : "Save page"} onPress={() => void save()} disabled={saving || uploading || body.trim().length === 0} testID="diary-write-save" />}
    >
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
    </Sheet>
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
    chips: { flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.sm },
    actionLabel: { fontSize: theme.fontSize.body, fontWeight: theme.fontWeight.semibold, color: theme.color.text },
  });
