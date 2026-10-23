import { useCallback, useEffect, useState } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";

import { Icon } from "./ui/Icon";
import { PhotoCropSheet } from "./PhotoCropSheet";
import { Button } from "./ui/Button";
import { Sheet } from "./ui/Sheet";
import { TextButton } from "./ui/TextButton";
import {
  MAX_PROFILE_PHOTOS,
  ProfilePhoto,
  deleteProfilePhoto,
  loadProfilePhotos,
  photoThumb,
  reorderProfilePhotos,
  uploadProfilePhoto,
} from "../features/profile/profilePhotosApi";
import { pickMedia } from "../lib/media";
import { useTheme, useThemedStyles } from "../providers/ThemeProvider";
import { useToast } from "../providers/ToastProvider";
import { Theme } from "../theme/themes";

const TILE = 72;

type Props = { profileId: string };

/**
 * A person's profile photos (#135): up to 8 round photos, the first is the cover. Tap the plus to add (pick → round
 * crop → upload); tap a photo to make it the cover, move it, or remove it. With no photo yet a silhouette invites
 * the first one.
 */
export function ProfilePhotoGallery({ profileId }: Props) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const toast = useToast();
  const [photos, setPhotos] = useState<ProfilePhoto[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [cropFile, setCropFile] = useState<Blob | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [working, setWorking] = useState(false);

  const load = useCallback(async () => {
    try {
      setPhotos(await loadProfilePhotos(profileId));
      setLoadError(null);
    } catch (e) {
      setLoadError((e as Error).message);
    }
  }, [profileId]);

  useEffect(() => {
    void load();
  }, [load]);

  const add = async () => {
    try {
      const picked = await pickMedia({ purpose: "profile" });
      if (picked) {
        setUploadError(null);
        setCropFile(picked.file);
      }
    } catch (e) {
      toast.show((e as Error).message);
    }
  };

  const upload = async (cropped: Blob) => {
    setUploading(true);
    setUploadError(null);
    try {
      const added = await uploadProfilePhoto(cropped);
      setPhotos((current) => [...(current ?? []), added]);
      setCropFile(null);
    } catch (e) {
      setUploadError((e as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const reorder = async (ids: string[]) => {
    setWorking(true);
    try {
      await reorderProfilePhotos(ids);
      setPhotos((current) => ids.map((id) => (current ?? []).find((p) => p.id === id)!));
    } catch (e) {
      toast.show((e as Error).message);
    } finally {
      setWorking(false);
    }
  };

  const remove = async (id: string) => {
    setWorking(true);
    try {
      await deleteProfilePhoto(id);
      setPhotos((current) => (current ?? []).filter((p) => p.id !== id));
      setSelected(null);
      setConfirmRemove(false);
    } catch (e) {
      toast.show((e as Error).message);
    } finally {
      setWorking(false);
    }
  };

  const closeActions = () => {
    setSelected(null);
    setConfirmRemove(false);
  };

  if (loadError) return <Text style={styles.muted}>{loadError}</Text>;
  if (!photos) return null;

  const ids = photos.map((p) => p.id);
  const index = selected ? ids.indexOf(selected) : -1;
  const move = (from: number, to: number) => {
    const next = [...ids];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    void reorder(next);
    closeActions();
  };

  return (
    <View style={styles.wrap} testID="profile-photos">
      {photos.length === 0 ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Add a photo" onPress={() => void add()} style={styles.empty} testID="photos-placeholder">
          <View style={styles.silhouette}>
            <Icon name="person" size={TILE * 0.5} color={theme.color.textMuted} />
          </View>
          <Text style={styles.addText}>Add a photo</Text>
        </Pressable>
      ) : (
        <View style={styles.row}>
          {photos.map((photo, i) => (
            <Pressable
              key={photo.id}
              accessibilityRole="button"
              accessibilityLabel={i === 0 ? "Cover photo" : `Photo ${i + 1}`}
              onPress={() => setSelected(photo.id)}
              style={styles.tileWrap}
              testID={`photos-tile-${photo.id}`}
            >
              <Image source={{ uri: photoThumb(photo) }} style={[styles.tile, i === 0 && styles.cover]} />
              {i === 0 ? <Text style={styles.coverLabel}>Cover</Text> : null}
            </Pressable>
          ))}
          {photos.length < MAX_PROFILE_PHOTOS ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Add a photo" onPress={() => void add()} style={styles.tileWrap} testID="photos-add">
              <View style={[styles.tile, styles.plus]}>
                <Icon name="add" size={28} color={theme.color.primary} />
              </View>
            </Pressable>
          ) : null}
        </View>
      )}

      <PhotoCropSheet
        visible={cropFile !== null}
        file={cropFile}
        busy={uploading}
        error={uploadError}
        onConfirm={(blob) => void upload(blob)}
        onClose={() => !uploading && setCropFile(null)}
      />

      <Sheet visible={index >= 0} title={index === 0 ? "Cover photo" : "Photo"} onClose={closeActions} testID="photo-actions">
        {confirmRemove ? (
          <View style={styles.actions}>
            <Text style={styles.muted}>This photo is deleted for good.</Text>
            <Button label={working ? "Removing…" : "Remove photo"} variant="danger" onPress={() => selected && void remove(selected)} disabled={working} testID="photo-remove-confirm" />
            <Button label="Keep it" variant="secondary" onPress={() => setConfirmRemove(false)} testID="photo-remove-cancel" />
          </View>
        ) : (
          <View style={styles.actions}>
            {index > 0 ? <Button label="Make cover" onPress={() => move(index, 0)} disabled={working} testID="photo-make-cover" /> : null}
            {index > 0 ? <Button label="Move earlier" variant="secondary" onPress={() => move(index, index - 1)} disabled={working} testID="photo-move-earlier" /> : null}
            {index >= 0 && index < photos.length - 1 ? (
              <Button label="Move later" variant="secondary" onPress={() => move(index, index + 1)} disabled={working} testID="photo-move-later" />
            ) : null}
            <TextButton label="Remove photo" danger onPress={() => setConfirmRemove(true)} testID="photo-remove" />
          </View>
        )}
      </Sheet>
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    wrap: { gap: theme.spacing.sm },
    row: { flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.md },
    tileWrap: { alignItems: "center", gap: theme.spacing.xs },
    tile: { width: TILE, height: TILE, borderRadius: TILE / 2, backgroundColor: theme.color.border },
    cover: { borderWidth: 3, borderColor: theme.color.primary },
    coverLabel: { fontSize: theme.fontSize.caption, color: theme.color.primary, fontWeight: theme.fontWeight.semibold },
    plus: { alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: theme.color.borderStrong, backgroundColor: theme.color.surface },
    // The same size as a photo tile, so the row does not jump when the first photo arrives.
    empty: { alignSelf: "flex-start", alignItems: "center", gap: theme.spacing.xs },
    silhouette: { width: TILE, height: TILE, borderRadius: TILE / 2, backgroundColor: theme.color.border, alignItems: "center", justifyContent: "center" },
    addText: { fontSize: theme.fontSize.small, color: theme.color.primary, fontWeight: theme.fontWeight.semibold },
    actions: { gap: theme.spacing.sm },
    muted: { fontSize: theme.fontSize.small, lineHeight: theme.lineHeight.small, color: theme.color.textMuted },
  });
