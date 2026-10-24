import { useEffect, useMemo, useState } from "react";
import { Image, StyleSheet, Text, View } from "react-native";

import { Button } from "./ui/Button";
import { Icon } from "./ui/Icon";
import { NoteToggle } from "./ui/NoteToggle";
import { SegmentedControl } from "./ui/SegmentedControl";
import { Sheet } from "./ui/Sheet";
import { TextField } from "./ui/TextField";
import { useTheme, useThemedStyles } from "../providers/ThemeProvider";
import { Theme } from "../theme/themes";

/** A memo on a photo is a few words (015j: up to 200 characters). */
export const FEED_NOTE_MAX = 200;

type Props = {
  /** The picked photo or video; the sheet is open while there is one. */
  file: File | null;
  /** Who else may see it if shared: "Robert", "your sitter". */
  shareWith: string;
  /** False after a stay: the photo can only be kept for me. */
  canShare: boolean;
  /** What is picked when the sheet opens: the sitter on duty shares with the owner, the owner keeps it for themself. */
  defaultShare: boolean;
  saving: boolean;
  /** What is happening while it saves ("Uploading…"). */
  statusText?: string;
  onClose: () => void;
  onSave: (choice: { share: boolean; note: string }) => void;
};

/**
 * Adding a photo to the Feed (#345): see it, choose Only me or Share with the other person, add a short memo if you
 * like, then Save. Nothing is uploaded or shared before Save.
 */
export function AddPhotoSheet({ file, shareWith, canShare, defaultShare, saving, statusText, onClose, onSave }: Props) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const [share, setShare] = useState(defaultShare);
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState("");

  // A new photo starts from the role's usual choice.
  useEffect(() => {
    setShare(defaultShare);
    setNoteOpen(false);
    setNote("");
  }, [file, defaultShare]);

  const preview = useMemo(
    () => (file && file.type.startsWith("image/") && typeof URL !== "undefined" ? URL.createObjectURL(file) : null),
    [file],
  );
  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  return (
    <Sheet
      visible={file != null}
      title="Add to Feed"
      onClose={() => {
        if (!saving) onClose();
      }}
      testID="feed-add-sheet"
      footer={
        <Button
          label="Save"
          loading={saving}
          onPress={() => onSave({ share: canShare && share, note: note.trim() })}
          testID="feed-add-save"
        />
      }
    >
      <View style={styles.body}>
        {saving && statusText ? (
          <Text style={styles.status} testID="feed-uploading-text">
            {statusText}
          </Text>
        ) : null}
        <View style={styles.preview} testID="feed-add-preview">
          {preview ? (
            <Image source={{ uri: preview }} style={styles.image} resizeMode="cover" accessibilityIgnoresInvertColors />
          ) : (
            <Icon name="video" size={32} color={theme.color.onMedia} />
          )}
        </View>
        <SegmentedControl
          options={[
            { value: "me", label: "Only me" },
            { value: "share", label: `Share with ${shareWith}`, disabled: !canShare },
          ]}
          value={canShare && share ? "share" : "me"}
          onChange={(value) => setShare(value === "share")}
          testID="feed-add-share"
        />
        <View style={styles.noteRow}>
          <NoteToggle open={noteOpen} filled={note.trim().length > 0} onPress={() => setNoteOpen((open) => !open)} testID="feed-add-note-toggle" />
          {noteOpen ? (
            <View style={styles.noteField}>
              <TextField
                label=""
                accessibilityLabel="Note"
                value={note}
                onChangeText={setNote}
                maxLength={FEED_NOTE_MAX}
                multiline
                testID="feed-add-note"
              />
            </View>
          ) : null}
        </View>
      </View>
    </Sheet>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    body: { gap: theme.spacing.md },
    preview: {
      height: 200,
      borderRadius: theme.radius.xl,
      overflow: "hidden",
      backgroundColor: theme.color.media,
      alignItems: "center",
      justifyContent: "center",
    },
    image: { width: "100%", height: "100%" },
    status: { fontSize: theme.fontSize.small, color: theme.color.textMuted },
    noteRow: { flexDirection: "row", alignItems: "flex-start", gap: theme.spacing.sm },
    noteField: { flex: 1 },
  });
