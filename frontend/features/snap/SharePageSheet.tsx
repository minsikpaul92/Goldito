import { useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Button } from "../../components/ui/Button";
import { Sheet } from "../../components/ui/Sheet";
import { uploadMedia } from "../../lib/cloudinary";
import { useErrorDialog } from "../../providers/ErrorDialogProvider";
import { useThemedStyles } from "../../providers/ThemeProvider";
import { useToast } from "../../providers/ToastProvider";
import { Theme } from "../../theme/themes";
import type { DiaryImage } from "./diaryImage";
import { diaryFilename, downloadBlob } from "./download";

type Props = {
  visible: boolean;
  onClose: () => void;
  petId: string;
  petName: string;
  day: string;
  /** Draws the page as it is on screen (both sticker layers). */
  render: () => Promise<DiaryImage>;
  /** Changes when the stickers change, so an old link is not offered for a newer page. */
  version: string;
};

function canShareFiles(): boolean {
  try {
    const probe = new File([new Blob()], "x.png", { type: "image/png" });
    return typeof navigator !== "undefined" && typeof navigator.share === "function" && !!navigator.canShare?.({ files: [probe] });
  } catch {
    return false;
  }
}

/**
 * Share a decorated diary page (Diary book DB.5) — three ways, all from the page as it is drawn on screen:
 * the phone's share sheet with the image (where the browser can share files), a download, or a public image link.
 * The link uploads the image to Cloudinary (`diary_page`, 014b); Cloudinary links are public, so the sheet says so
 * before anything is uploaded. One upload per version of the page in this session.
 */
export function SharePageSheet({ visible, onClose, petId, petName, day, render, version }: Props) {
  const styles = useThemedStyles(makeStyles);
  const toast = useToast();
  const errorDialog = useErrorDialog();
  const [busy, setBusy] = useState<"share" | "download" | "link" | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const uploaded = useRef<{ version: string; url: string } | null>(null);
  const filename = diaryFilename(petName, day);
  const shown = link && uploaded.current?.version === version ? link : null;

  const told = (missing: number, done: string) =>
    toast.show(missing > 0 ? `${done}, but ${missing === 1 ? "one picture" : `${missing} pictures`} couldn't be added` : done, missing > 0 ? { tone: "warning" } : undefined);

  const share = async () => {
    setBusy("share");
    try {
      const { blob, missing } = await render();
      const file = new File([blob], filename, { type: "image/png" });
      await navigator.share({ files: [file], title: `${petName}'s diary` });
      told(missing, "Shared 📔");
      onClose();
    } catch (error) {
      // Closing the share sheet without picking anything is not an error.
      if ((error as Error).name !== "AbortError") errorDialog.show({ title: "Not shared", message: (error as Error).message });
    } finally {
      setBusy(null);
    }
  };

  const download = async () => {
    setBusy("download");
    try {
      const { blob, missing } = await render();
      downloadBlob(blob, filename);
      told(missing, `Saved ${petName}'s diary page 📔`);
      onClose();
    } catch (error) {
      errorDialog.show({ title: "Image not saved", message: (error as Error).message, onRetry: () => void download() });
    } finally {
      setBusy(null);
    }
  };

  const copyLink = async () => {
    setBusy("link");
    try {
      let url = uploaded.current?.version === version ? uploaded.current.url : null;
      if (!url) {
        const { blob } = await render();
        const up = await uploadMedia({ petId, purpose: "diary_page", file: blob, resourceType: "image" });
        url = up.secureUrl;
        uploaded.current = { version, url };
      }
      setLink(url);
      try {
        await navigator.clipboard.writeText(url);
        toast.show("Link copied");
      } catch {
        toast.show("Copy the link from the box");
      }
    } catch (error) {
      errorDialog.show({ title: "No link yet", message: (error as Error).message, onRetry: () => void copyLink() });
    } finally {
      setBusy(null);
    }
  };

  return (
    <Sheet visible={visible} title={`Share ${petName}'s page`} onClose={onClose} testID="decor-share-sheet">
      <View style={styles.body}>
        {canShareFiles() ? (
          <Button label={busy === "share" ? "Getting it ready…" : "↗ Share image"} disabled={busy != null} onPress={() => void share()} testID="decor-share-image" />
        ) : null}
        <Button
          label={busy === "download" ? "Saving image…" : "⬇ Download image"}
          variant="secondary"
          disabled={busy != null}
          onPress={() => void download()}
          testID="decor-save-image"
        />
        <Text style={styles.note} testID="decor-link-note">
          A link is a public copy of this page as an image: anyone who has the link can open it.
        </Text>
        <Button
          label={busy === "link" ? "Making a link…" : "🔗 Copy public link"}
          variant="secondary"
          disabled={busy != null}
          onPress={() => void copyLink()}
          testID="decor-copy-link"
        />
        {shown ? (
          <Text selectable style={styles.link} testID="decor-link">
            {shown}
          </Text>
        ) : null}
      </View>
    </Sheet>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    body: { gap: theme.spacing.sm },
    note: { fontSize: theme.fontSize.small, color: theme.color.textMuted },
    link: {
      fontSize: theme.fontSize.small,
      color: theme.color.text,
      padding: theme.spacing.sm,
      borderRadius: theme.radius.sm,
      borderWidth: 1,
      borderColor: theme.color.border,
      backgroundColor: theme.color.surface,
    },
  });
