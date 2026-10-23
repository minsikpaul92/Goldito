import { useState } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";

import { Icon } from "../../components/ui/Icon";
import { PhotoCropSheet } from "../PhotoCropSheet";
import { Button } from "../ui/Button";
import { Sheet } from "../ui/Sheet";
import { TextButton } from "../ui/TextButton";
import { MAX_PET_PHOTOS, petPhotoThumb, uploadPetPhotoFile } from "../../features/ownerOnboarding/petPhotosApi";
import { pickMedia } from "../../lib/media";
import { useTheme, useThemedStyles } from "../../providers/ThemeProvider";
import { useToast } from "../../providers/ToastProvider";
import { Theme } from "../../theme/themes";

const TILE = 96;

type Props = {
  /** Cloudinary public ids, cover first. */
  photos: string[];
  onChange: (photos: string[]) => void;
  /** Reports an upload in progress, so Next waits for it. */
  onBusy: (busy: boolean) => void;
};

/** Up to 8 photos of the pet: add (pick, crop, upload), tap one to make it the cover or remove it. */
export function PetPhotosStep({ photos, onChange, onBusy }: Props) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const toast = useToast();
  const [cropFile, setCropFile] = useState<Blob | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<number | null>(null);

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
    onBusy(true);
    setUploadError(null);
    try {
      const publicId = await uploadPetPhotoFile(cropped);
      onChange([...photos, publicId]);
      setCropFile(null);
    } catch (e) {
      setUploadError((e as Error).message);
    } finally {
      setUploading(false);
      onBusy(false);
    }
  };

  const makeCover = (index: number) => {
    const next = [...photos];
    const [item] = next.splice(index, 1);
    next.unshift(item);
    onChange(next);
    setSelected(null);
  };

  const remove = (index: number) => {
    onChange(photos.filter((_, i) => i !== index));
    setSelected(null);
  };

  return (
    <View style={styles.row} testID="own-photos">
      {photos.map((publicId, i) => (
        <Pressable
          key={publicId}
          accessibilityRole="button"
          accessibilityLabel={i === 0 ? "Cover photo" : `Photo ${i + 1}`}
          onPress={() => setSelected(i)}
          style={styles.tileWrap}
          testID={`own-photo-${i}`}
        >
          <Image source={{ uri: petPhotoThumb(publicId, TILE * 2) }} style={[styles.tile, i === 0 && styles.cover]} />
          {i === 0 ? <Text style={styles.coverLabel}>Cover</Text> : null}
        </Pressable>
      ))}
      {photos.length < MAX_PET_PHOTOS ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add a photo"
          onPress={() => void add()}
          style={styles.tileWrap}
          testID="own-photo-add"
        >
          <View style={[styles.tile, styles.plus]}>
            <Icon name="add" size={theme.icon.hero} color={theme.color.primary} />
          </View>
        </Pressable>
      ) : null}

      <PhotoCropSheet
        visible={cropFile !== null}
        file={cropFile}
        busy={uploading}
        error={uploadError}
        onConfirm={(blob) => void upload(blob)}
        onClose={() => !uploading && setCropFile(null)}
      />

      <Sheet visible={selected !== null} title={selected === 0 ? "Cover photo" : "Photo"} onClose={() => setSelected(null)} testID="own-photo-actions">
        <View style={styles.actions}>
          {selected !== null && selected > 0 ? (
            <Button label="Make cover" onPress={() => makeCover(selected)} testID="own-photo-cover" />
          ) : null}
          <TextButton label="Remove photo" danger onPress={() => selected !== null && remove(selected)} testID="own-photo-remove" />
        </View>
      </Sheet>
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    row: { flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.md },
    tileWrap: { alignItems: "center", gap: theme.spacing.xs },
    tile: { width: TILE, height: TILE, borderRadius: theme.ui.radius.card, backgroundColor: theme.color.border },
    cover: { borderWidth: 3, borderColor: theme.color.primary },
    coverLabel: { fontSize: 14, color: theme.color.primary, fontWeight: theme.fontWeight.semibold },
    plus: {
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 2,
      borderColor: theme.color.borderStrong,
      backgroundColor: theme.color.surface,
    },
    actions: { gap: theme.spacing.sm },
  });
