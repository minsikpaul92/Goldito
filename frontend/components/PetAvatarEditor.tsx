import Ionicons from "@expo/vector-icons/Ionicons";
import { useCallback, useEffect, useState } from "react";
import { Image, Pressable, StyleSheet, View } from "react-native";

import { PhotoCropSheet } from "./PhotoCropSheet";
import { Avatar } from "./ui/Avatar";
import { completePetPhoto, deletePetPhoto, loadPetPhotos, petPhotoThumb, uploadPetPhotoFile } from "../features/ownerOnboarding/petPhotosApi";
import { SPECIES_EMOJI } from "../features/pets/petFormat";
import { pickMedia } from "../lib/media";
import { useTheme, useThemedStyles } from "../providers/ThemeProvider";
import { useToast } from "../providers/ToastProvider";
import { Theme } from "../theme/themes";
import { Pet } from "../types/db";

const SIZE = 96;

/** The pet's round photo at the top of its page. Tap it to pick, crop and upload a new one; the camera badge shows it can be changed. */
export function PetAvatarEditor({ pet, onChanged }: { pet: Pet; onChanged: () => void }) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const toast = useToast();
  const [cover, setCover] = useState<{ id: string; publicId: string } | null>(null);
  const [cropFile, setCropFile] = useState<Blob | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setCover((await loadPetPhotos(pet.id))[0] ?? null);
    } catch {
      setCover(null);
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
      toast.show((e as Error).message);
    }
  };

  const upload = async (cropped: Blob) => {
    setBusy(true);
    setError(null);
    try {
      const publicId = await uploadPetPhotoFile(cropped);
      await completePetPhoto(pet.id, publicId);
      if (cover) await deletePetPhoto(cover.id);
      setCropFile(null);
      await load();
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.root}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={cover ? "Change photo" : "Add photo"}
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
          <Ionicons name="camera" size={theme.icon.sm} color={theme.color.primaryText} />
        </View>
      </Pressable>
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
    root: { alignItems: "center" },
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
