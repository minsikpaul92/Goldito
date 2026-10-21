import { useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Button } from "../../components/ui/Button";
import { SegmentedControl } from "../../components/ui/SegmentedControl";
import { Sheet } from "../../components/ui/Sheet";
import { TextButton } from "../../components/ui/TextButton";
import { UploadError, uploadMedia } from "../../lib/cloudinary";
import { FALLBACK_CAPTION, createFeedPost } from "../../lib/feed";
import { PickedMedia, pickMedia } from "../../lib/media";
import { useErrorDialog } from "../../providers/ErrorDialogProvider";
import { useSession } from "../../providers/SessionProvider";
import { useThemedStyles } from "../../providers/ThemeProvider";
import { useToast } from "../../providers/ToastProvider";
import { Theme } from "../../theme/themes";
import { appToday } from "../schedule/dates";
import { type DecorItem, saveDecor } from "../snap/decorApi";
import { DecoratedReport } from "../snap/DecoratedReport";
import { REPORT_BODY_MAX, addOwnerEntry, setDiaryPagePhoto } from "./reportApi";

type Props = {
  visible: boolean;
  pets: { id: string; name: string }[];
  /** Open on this pet (the one the book is showing). */
  initialPetId?: string | null;
  onClose: () => void;
  /** The page is saved: the new page's id. */
  onSaved: (reportId: string, petId: string) => void;
};

/**
 * The owner's own diary page (014p, #186): write on the page, add a photo if you like, save. The page is sent to the
 * owner's book at once (no AI, no notice, the sitter never sees it). The photo shows in the page's picture box and is
 * also kept in Feed, private.
 * Stickers can go on while writing; they are saved with the page.
 */
export function OwnerEntrySheet({ visible, pets, initialPetId, onClose, onSaved }: Props) {
  const styles = useThemedStyles(makeStyles);
  const toast = useToast();
  const errorDialog = useErrorDialog();
  const [petId, setPetId] = useState<string | null>(null);
  const [body, setBody] = useState("");
  const [photo, setPhoto] = useState<PickedMedia | null>(null);
  const [stickers, setStickers] = useState<DecorItem[]>([]);
  const session = useSession();
  const me = session.status === "signedIn" ? session.profile.id : null;
  const [saving, setSaving] = useState(false);

  // Each time it opens: an empty page for the pet the book is on.
  useEffect(() => {
    if (!visible) return;
    setPetId(initialPetId && pets.some((p) => p.id === initialPetId) ? initialPetId : (pets[0]?.id ?? null));
    setBody("");
    setPhoto(null);
    setStickers([]);
  }, [visible, initialPetId, pets]);

  const pet = pets.find((p) => p.id === petId) ?? null;

  // The picked photo shows in the page's picture box at once.
  const preview = useMemo(() => (photo && typeof URL !== "undefined" ? URL.createObjectURL(photo.file) : null), [photo]);
  useEffect(() => () => (preview ? URL.revokeObjectURL(preview) : undefined), [preview]);

  const addPhoto = async () => {
    const picked = await pickMedia({ purpose: "feed", mediaTypes: ["image"] });
    if (picked) setPhoto(picked);
  };

  const save = async () => {
    if (!pet || saving) return;
    setSaving(true);
    try {
      // The photo goes up first: if it fails nothing is saved yet and Retry runs the whole thing again.
      const uploaded = photo
        ? await uploadMedia({ petId: pet.id, purpose: "feed", file: photo.file, trim: photo.trim, resourceType: "image" })
        : null;
      const reportId = await addOwnerEntry(pet.id, body);
      if (uploaded) {
        try {
          await setDiaryPagePhoto(reportId, uploaded.mediaId);
          await createFeedPost({
            petId: pet.id,
            mediaId: uploaded.mediaId,
            caption: FALLBACK_CAPTION,
            captionSource: "fallback",
            role: "owner",
            visibility: "private",
          });
        } catch {
          toast.show("Page saved, but the photo wasn't added.");
        }
      }
      if (stickers.length > 0 && me) {
        try {
          await saveDecor(reportId, me, stickers);
        } catch {
          toast.show("Page saved, but the stickers weren't.");
        }
      }
      toast.show("Page saved 📔");
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
      visible={visible}
      title="New page"
      onClose={onClose}
      scrollbar
      testID="diary-write-sheet"
      footer={<Button label={saving ? "Saving…" : "Save page"} onPress={() => void save()} disabled={saving || body.trim().length === 0} testID="diary-write-save" />}
    >
      {pets.length > 1 ? (
        <SegmentedControl
          options={pets.map((p) => ({ value: p.id, label: p.name }))}
          value={petId}
          onChange={setPetId}
          scrollable={pets.length > 3}
          testID="diary-write-pet"
        />
      ) : null}
      {pet ? (
        <DecoratedReport
          reportId={null}
          petId={pet.id}
          petName={pet.name}
          day={appToday()}
          body={body}
          pictureUrl={preview}
          testID="diary-write-page"
          pending={{ items: stickers, onChange: setStickers }}
          writing={{ onChangeText: setBody, placeholder: "Dear diary, today…", maxLength: REPORT_BODY_MAX, disabled: saving, testID: "diary-write-body" }}
        />
      ) : null}
      <View style={styles.row}>
        {photo ? (
          <>
            <Text style={styles.photo} testID="diary-write-photo-added">
              📷 Photo added
            </Text>
            <TextButton label="Remove" onPress={() => setPhoto(null)} testID="diary-write-photo-remove" />
          </>
        ) : (
          <TextButton label="+ Photo" onPress={() => void addPhoto()} testID="diary-write-photo" />
        )}
      </View>
    </Sheet>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    row: { flexDirection: "row", alignItems: "center", gap: theme.spacing.sm },
    photo: { fontSize: theme.fontSize.body, color: theme.color.text },
  });
