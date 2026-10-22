import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Button } from "../ui/Button";
import { Sheet } from "../ui/Sheet";
import { TextButton } from "../ui/TextButton";
import { savePixelColors } from "../../features/pets/petApi";
import { colorsFromPhoto } from "../../features/pets/sprites/colorsFromPhoto";
import type { PixelColors } from "../../features/pets/sprites/photoColors";
import { pickMedia } from "../../lib/media";
import { useThemedStyles } from "../../providers/ThemeProvider";
import { useToast } from "../../providers/ToastProvider";
import { Theme } from "../../theme/themes";
import type { Species } from "../../types/db";
import { PetSprite } from "./PetSprite";

type Props = {
  visible: boolean;
  onClose: () => void;
  pet: { id: string; name: string; species: Species; coat?: unknown; breed?: string | null; colors: PixelColors | null };
  /** After a save or a reset, so the pet room redraws. */
  onSaved: () => void;
};

/** Photo colors (11.12 PS.3): pick a photo, see the pet's preset in its colors, Save them to the pet. Owner only, web. */
export function PetColorsSheet({ visible, onClose, pet, onSaved }: Props) {
  const styles = useThemedStyles(makeStyles);
  const toast = useToast();
  const [picked, setPicked] = useState<PixelColors | null>(null);
  const [busy, setBusy] = useState<"making" | "saving" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) {
      setPicked(null);
      setError(null);
    }
  }, [visible]);

  const pick = async () => {
    const media = await pickMedia({ purpose: "sticker", mediaTypes: ["image"] });
    if (!media) return;
    setBusy("making");
    setError(null);
    try {
      setPicked((await colorsFromPhoto(media.file)).colors);
    } catch (e) {
      setError((e as Error).message || "Couldn't read the colors. Try another photo.");
    } finally {
      setBusy(null);
    }
  };

  const save = async (colors: PixelColors | null) => {
    setBusy("saving");
    try {
      await savePixelColors(pet.id, colors);
      toast.show(colors ? `${pet.name}'s colors saved` : "Back to the coat color");
      onSaved();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Sheet
      visible={visible}
      title="Colors from a photo"
      onClose={onClose}
      testID="pet-colors-sheet"
      footer={
        picked ? (
          <Button label={busy === "saving" ? "Saving..." : "Save"} onPress={() => void save(picked)} disabled={!!busy} testID="pet-colors-save" />
        ) : (
          <Button label={busy === "making" ? "Reading colors..." : "Pick a photo"} onPress={() => void pick()} disabled={!!busy} testID="pet-colors-pick" />
        )
      }
    >
      <View style={styles.preview}>
        <PetSprite species={pet.species} coat={pet.coat} breed={pet.breed} colors={picked ?? pet.colors} mood="calm" pixel={5} testID="pet-colors-preview" />
      </View>
      {error ? (
        <Text style={styles.error} testID="pet-colors-error">
          {error}
        </Text>
      ) : null}
      {picked ? <TextButton label="Try another photo" onPress={() => void pick()} disabled={!!busy} testID="pet-colors-again" /> : null}
      {!picked && pet.colors ? (
        <TextButton label="Use the coat color" onPress={() => void save(null)} disabled={!!busy} testID="pet-colors-reset" />
      ) : null}
    </Sheet>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    preview: { alignItems: "center", paddingVertical: theme.spacing.md },
    error: { color: theme.color.error, textAlign: "center", fontSize: theme.fontSize.body },
  });
