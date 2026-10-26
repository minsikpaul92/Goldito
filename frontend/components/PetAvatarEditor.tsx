import { useCallback, useEffect, useState } from "react";
import { Image, Pressable, StyleSheet, View } from "react-native";

import { Icon } from "./ui/Icon";
import { PhotoCropSheet } from "./PhotoCropSheet";
import { Avatar } from "./ui/Avatar";
import { MAX_PET_PHOTOS, PetPhoto, completePetPhoto, deletePetPhoto, loadPetPhotos, petPhotoThumb, uploadPetPhotoFile } from "../features/ownerOnboarding/petPhotosApi";
import { SPECIES_EMOJI } from "../features/pets/petFormat";
import { pickMedia } from "../lib/media";
import { useTheme, useThemedStyles } from "../providers/ThemeProvider";
import { useToast } from "../providers/ToastProvider";
import { Theme } from "../theme/themes";
import { Pet } from "../types/db";

const SIZE = 96;
const TILE = 64;

/**
 * The pet's photos at the top of its page: the round cover, and a row with every photo (up to 8) and a plus to add one.
 * The camera badge and the plus pick, crop and upload a new photo; the red minus on a photo deletes it.
 */
export function PetAvatarEditor({ pet, onChanged }: { pet: Pet; onChanged: () => void }) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const toast = useToast();
  const [photos, setPhotos] = useState<PetPhoto[]>([]);
  const cover = photos[0] ?? null;
  const [cropFile, setCropFile] = useState<Blob | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setPhotos(await loadPetPhotos(pet.id));
    } catch {
      setPhotos([]);
    }
  }, [pet.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const pick = async () => {
    try {
      const picked = await pickMedia({ purpose: "profile" });
      if (picked) {
        setError(null);
        setCropFile(picked.file);
      }
    } catch (e) {
      toast.show((e as Error).message, { tone: "error" });
    }
  };

  const upload = async (cropped: Blob) => {
    setBusy(true);
    setError(null);
    try {
      const publicId = await uploadPetPhotoFile(cropped);
      await completePetPhoto(pet.id, publicId);
      setCropFile(null);
      await load();
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (photo: PetPhoto) => {
    setPhotos((current) => current.filter((p) => p.id !== photo.id));
    try {
      await deletePetPhoto(photo.id);
      onChanged();
    } catch (e) {
      toast.show((e as Error).message, { tone: "error" });
      await load();
    }
  };

  return (
    <View style={styles.root}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Add photo"
        onPress={() => void pick()}
        style={styles.avatar}
        testID="pet-avatar"
      >
        {cover ? (
          <Image source={{ uri: petPhotoThumb(cover.publicId, SIZE * 2) }} style={styles.photo} testID="pet-avatar-photo" />
        ) : (
          <Avatar kind="emoji" emoji={SPECIES_EMOJI[pet.species]} size={SIZE} />
        )}
        <View style={styles.badge} testID="pet-avatar-edit">
          <Icon name="camera" size={theme.icon.sm} color={theme.color.primaryText} />
        </View>
      </Pressable>
      {photos.length > 0 ? (
        <View style={styles.row} testID="pet-photos">
          {photos.map((photo, i) => (
            <View key={photo.id} style={styles.tileWrap}>
              <Image source={{ uri: petPhotoThumb(photo.publicId, TILE * 2) }} style={styles.tile} accessibilityLabel={`${pet.name} photo ${i + 1}`} />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Delete photo ${i + 1}`}
                hitSlop={6}
                onPress={() => void remove(photo)}
                style={styles.minus}
                testID={`pet-photo-delete-${i + 1}`}
              >
                <Icon name="remove" size={14} color={theme.color.primaryText} strokeWidth={3} />
              </Pressable>
            </View>
          ))}
          {photos.length < MAX_PET_PHOTOS ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Add photo" onPress={() => void pick()} style={[styles.tile, styles.plus]} testID="pet-photo-add">
              <Icon name="add" size={24} color={theme.color.primary} />
            </Pressable>
          ) : null}
        </View>
      ) : null}
      <PhotoCropSheet
        visible={cropFile !== null}
        file={cropFile}
        busy={busy}
        error={error}
        onConfirm={(blob) => void upload(blob)}
        onClose={() => !busy && setCropFile(null)}
      />
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    root: { alignItems: "center", gap: theme.spacing.md, marginBottom: theme.spacing.md },
    row: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: theme.spacing.sm },
    tileWrap: { width: TILE, height: TILE },
    tile: { width: TILE, height: TILE, borderRadius: TILE / 2, backgroundColor: theme.color.border },
    plus: { alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: theme.color.borderStrong, backgroundColor: theme.color.surface },
    // A red circle with a white minus on the photo's corner, like the camera badge on the cover.
    minus: {
      position: "absolute",
      top: -4,
      right: -4,
      width: 24,
      height: 24,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.color.error,
      borderWidth: 2,
      borderColor: theme.color.background,
    },
    avatar: { width: SIZE, height: SIZE },
    photo: { width: SIZE, height: SIZE, borderRadius: SIZE / 2, backgroundColor: theme.color.border },
    badge: {
      position: "absolute",
      top: -4,
      right: -4,
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.color.primary,
      borderWidth: 2,
      borderColor: theme.color.background,
    },
  });
