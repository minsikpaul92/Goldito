import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Button } from "../ui/Button";
import { Sheet } from "../ui/Sheet";
import { TextButton } from "../ui/TextButton";
import { savePixelHead } from "../../features/pets/petApi";
import { headFromPhoto } from "../../features/pets/sprites/headFromPhoto";
import type { PixelHead } from "../../features/pets/sprites/pixelize";
import { pickMedia } from "../../lib/media";
import { useThemedStyles } from "../../providers/ThemeProvider";
import { useToast } from "../../providers/ToastProvider";
import { Theme } from "../../theme/themes";
import type { Species } from "../../types/db";
import { PetSprite } from "./PetSprite";

type Props = {
  visible: boolean;
  onClose: () => void;
  pet: { id: string; name: string; species: Species; coat?: unknown; head: PixelHead | null };
  /** After a save or a reset, so the pet room redraws. */
  onSaved: () => void;
};

/** Photo to pixel head (11.12 PH.2): pick a photo, see the pixel pet, Save it to the pet. Owner only, web. */
export function PixelHeadSheet({ visible, onClose, pet, onSaved }: Props) {
  const styles = useThemedStyles(makeStyles);
  const toast = useToast();
  const [made, setMade] = useState<PixelHead | null>(null);
  const [busy, setBusy] = useState<"making" | "saving" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) {
      setMade(null);
      setError(null);
    }
  }, [visible]);

  const pick = async () => {
    const picked = await pickMedia({ purpose: "sticker", mediaTypes: ["image"] });
    if (!picked) return;
    setBusy("making");
    setError(null);
    try {
      setMade((await headFromPhoto(picked.file)).head);
    } catch (e) {
      setError((e as Error).message || "Couldn't make it. Try another photo.");
    } finally {
      setBusy(null);
    }
  };

  const save = async (head: PixelHead | null) => {
    setBusy("saving");
    try {
      await savePixelHead(pet.id, head);
      toast.show(head ? `${pet.name}'s pixel pet saved` : "Back to the preset");
      onSaved();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const shown = made ?? pet.head;

  return (
    <Sheet
      visible={visible}
      title="Pixel pet from a photo"
      onClose={onClose}
      testID="pixel-head-sheet"
      footer={
        made ? (
          <Button label={busy === "saving" ? "Saving..." : "Save"} onPress={() => void save(made)} disabled={!!busy} testID="pixel-head-save" />
        ) : (
          <Button label={busy === "making" ? "Making..." : "Pick a photo"} onPress={() => void pick()} disabled={!!busy} testID="pixel-head-pick" />
        )
      }
    >
      <View style={styles.preview}>
        <PetSprite species={pet.species} coat={pet.coat} head={shown} mood="calm" pixel={10} testID="pixel-head-preview" />
      </View>
      {error ? (
        <Text style={styles.error} testID="pixel-head-error">
          {error}
        </Text>
      ) : null}
      {made ? <TextButton label="Try another photo" onPress={() => void pick()} disabled={!!busy} testID="pixel-head-again" /> : null}
      {!made && pet.head ? (
        <TextButton label="Use the preset" onPress={() => void save(null)} disabled={!!busy} testID="pixel-head-reset" />
      ) : null}
    </Sheet>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    preview: { alignItems: "center", paddingVertical: theme.spacing.md },
    error: { color: theme.color.error, textAlign: "center", fontSize: theme.fontSize.body },
  });
