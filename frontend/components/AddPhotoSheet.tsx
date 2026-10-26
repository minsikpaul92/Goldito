import { useEffect, useMemo, useState } from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { FeedTagIcon } from "./FeedTagIcon";
import { PetFace, PetFaceInfo } from "./PetFace";
import { ProfileAvatar } from "./ProfileAvatar";
import { Button } from "./ui/Button";
import { Icon } from "./ui/Icon";
import { Sheet } from "./ui/Sheet";
import { TextField } from "./ui/TextField";
import { DemoSample, samplesFor } from "../lib/demoSamples";
import { FEED_TAGS, FeedTag } from "../lib/feed";
import { PickedMedia, pickMedia, sampleTray } from "../lib/media";
import { sampleToFile } from "../lib/sampleFile";
import { useTheme, useThemedStyles } from "../providers/ThemeProvider";
import { useToast } from "../providers/ToastProvider";
import { Theme } from "../theme/themes";

/** A memo on a photo is a few words (015j: up to 200 characters). */
export const FEED_NOTE_MAX = 200;
/** Sample photos shown in the row (the demo frame and demo accounts); "More" opens the full picker. */
const SAMPLE_PICKS = 3;

type Props = {
  visible: boolean;
  /** The photo or video chosen so far; nothing is uploaded or shared before Save. */
  picked: PickedMedia | null;
  onPicked: (picked: PickedMedia) => void;
  /** When the Moments tab shows several pets together: which pet this photo is of. */
  pets?: { id: string; name: string; face?: PetFaceInfo }[];
  petId?: string;
  onPetChange?: (petId: string) => void;
  /** Who else may see it if shared: "Robert", "your sitter". */
  shareWith: string;
  /** Their profile, for the photo on the switch. */
  shareWithId?: string;
  /** False after a stay: the photo can only be kept for me. */
  canShare: boolean;
  /** What is picked when the sheet opens: the sitter on duty shares with the owner, the owner keeps it for themself. */
  defaultShare: boolean;
  saving: boolean;
  /** What is happening while it saves ("Uploading…"). */
  statusText?: string;
  onClose: () => void;
  onSave: (choice: { share: boolean; note: string; tag: FeedTag | null }) => void;
};

/**
 * Adding a photo to Moments (#345, Muk's trial): pick a photo in the row at the top, choose the pet and an optional tag,
 * flip the switch to share it with the other person, then Save. A short memo hides behind the "+".
 */
export function AddPhotoSheet({
  visible,
  picked,
  onPicked,
  pets,
  petId,
  onPetChange,
  shareWith,
  shareWithId,
  canShare,
  defaultShare,
  saving,
  statusText,
  onClose,
  onSave,
}: Props) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const toast = useToast();
  const [share, setShare] = useState(defaultShare);
  const [tag, setTag] = useState<FeedTag | null>(null);
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState("");
  const [sampleId, setSampleId] = useState<string | null>(null);

  // Each time the sheet opens it starts from the role's usual choice.
  useEffect(() => {
    if (!visible) return;
    setShare(defaultShare);
    setTag(null);
    setNoteOpen(false);
    setNote("");
    setSampleId(null);
  }, [visible, defaultShare]);

  const samples = sampleTray.on ? samplesFor("feed", ["image"]).slice(0, SAMPLE_PICKS) : [];
  const file = picked?.file ?? null;
  const preview = useMemo(
    () => (file && !sampleId && file.type.startsWith("image/") && typeof URL !== "undefined" ? URL.createObjectURL(file) : null),
    [file, sampleId],
  );
  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  const pickSample = async (sample: DemoSample) => {
    if (saving) return;
    try {
      onPicked({ file: await sampleToFile(sample) });
      setSampleId(sample.id);
    } catch {
      toast.show("Could not load that sample. Try again.", { tone: "error" });
    }
  };
  const more = async () => {
    if (saving) return;
    const next = await pickMedia({ purpose: "feed", mediaTypes: ["image", "video"] });
    if (next) {
      setSampleId(null);
      onPicked(next);
    }
  };

  const sharing = canShare && share;
  return (
    <Sheet
      dirty={note.trim() !== ""}
      discardTitle="Discard your note?"
      visible={visible}
      title="Add a photo"
      onClose={() => {
        if (!saving) onClose();
      }}
      testID="feed-add-sheet"
      footer={
        <Button
          label={sharing ? `Save and share with ${shareWith}` : "Save, only you"}
          loading={saving}
          disabled={!file}
          onPress={() => onSave({ share: sharing, note: note.trim(), tag })}
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

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.picks} testID="feed-add-picks">
          {file && !sampleId ? (
            <View style={[styles.pick, styles.pickOn]} testID="feed-add-preview">
              {preview ? (
                <Image source={{ uri: preview }} style={styles.pickImage} resizeMode="cover" accessibilityIgnoresInvertColors />
              ) : (
                <Icon name="video" size={28} color={theme.color.onMedia} />
              )}
            </View>
          ) : null}
          {samples.map((sample) => (
            <Pressable
              key={sample.id}
              accessibilityRole="button"
              accessibilityLabel={`Use sample: ${sample.label}`}
              aria-pressed={sampleId === sample.id}
              onPress={() => void pickSample(sample)}
              style={[styles.pick, sampleId === sample.id && styles.pickOn]}
              testID={`sample-${sample.id}`}
            >
              <Image source={sample.source} style={styles.pickImage} resizeMode="cover" accessibilityIgnoresInvertColors />
            </Pressable>
          ))}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="More photos"
            onPress={() => void more()}
            style={[styles.pick, styles.more]}
            testID="feed-add-more"
          >
            <Icon name="add" size={26} color={theme.color.textMuted} />
          </Pressable>
        </ScrollView>

        {pets && pets.length > 1 && petId && onPetChange ? (
          <View style={styles.group} testID="feed-add-pet">
            <Text style={styles.label}>Pet</Text>
            <View style={styles.chips}>
              {pets.map((p) => (
                <Pressable
                  key={p.id}
                  accessibilityRole="button"
                  aria-pressed={p.id === petId}
                  onPress={() => onPetChange(p.id)}
                  style={[styles.chip, p.id === petId && styles.chipOn]}
                  testID={`feed-add-pet-${p.id}`}
                >
                  {p.face ? <PetFace pet={p.face} size={24} /> : null}
                  <Text style={styles.chipLabel}>{p.name}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}

        <View style={styles.group}>
          <Text style={styles.label}>Tag (optional)</Text>
          <View style={styles.chips}>
            {FEED_TAGS.map((t) => (
              <Pressable
                key={t.key}
                accessibilityRole="button"
                aria-pressed={tag === t.key}
                onPress={() => setTag(tag === t.key ? null : t.key)}
                style={[styles.chip, tag === t.key && styles.chipOn]}
                testID={`feed-add-tag-${t.key}`}
              >
                <FeedTagIcon tag={t.key} size={20} color={theme.color.text} />
                <Text style={styles.chipLabel}>{t.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.noteRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={noteOpen ? "Hide note" : "Add a note"}
            aria-expanded={noteOpen}
            onPress={() => setNoteOpen((open) => !open)}
            style={[styles.noteBtn, (noteOpen || note.trim().length > 0) && styles.noteBtnOn]}
            testID="feed-add-note-toggle"
          >
            <Text style={styles.noteBtnLabel}>✏️ Note</Text>
          </Pressable>
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
        <Pressable
          accessibilityRole="switch"
          aria-checked={sharing}
          disabled={!canShare}
          onPress={() => setShare((on) => !on)}
          style={[styles.share, sharing && styles.shareOn]}
          testID="feed-add-share"
        >
          <View style={styles.shareIcon}>
            {sharing ? (
              shareWithId ? (
                <ProfileAvatar profileId={shareWithId} name={shareWith} size={40} testID="feed-add-share-avatar" />
              ) : (
                <Text style={styles.shareInitial}>{shareWith.charAt(0).toUpperCase()}</Text>
              )
            ) : (
              <Text>🔒</Text>
            )}
          </View>
          <View style={styles.shareText}>
            <Text style={styles.shareTitle}>{sharing ? `Share with ${shareWith}` : "Only you"}</Text>
            <Text style={styles.shareSub}>
              {sharing ? `${shareWith} sees it right away` : canShare ? "Stays private, you can share later" : "The stay is over"}
            </Text>
          </View>
          <View style={[styles.track, sharing && styles.trackOn]}>
            <View style={[styles.knob, sharing && styles.knobOn]} />
          </View>
        </Pressable>

      </View>
    </Sheet>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    body: { gap: theme.spacing.md },
    status: { fontSize: theme.fontSize.small, color: theme.color.textMuted },
    picks: { gap: theme.spacing.sm, paddingVertical: 2 },
    pick: {
      width: 92,
      height: 92,
      borderRadius: theme.radius.lg,
      overflow: "hidden",
      backgroundColor: theme.color.media,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 3,
      borderColor: "transparent",
    },
    pickOn: { borderColor: theme.color.primary },
    pickImage: { width: "100%", height: "100%" },
    more: { backgroundColor: theme.color.surface, borderColor: theme.color.border, borderWidth: 1 },
    group: { gap: theme.spacing.xs },
    label: { fontSize: theme.fontSize.small, fontWeight: theme.fontWeight.bold, color: theme.color.textMuted },
    chips: { flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.sm },
    chip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      minHeight: 40,
      paddingHorizontal: theme.spacing.md,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: theme.color.border,
      backgroundColor: theme.color.surface,
    },
    chipOn: { backgroundColor: theme.color.accent, borderColor: theme.color.primary },
    chipLabel: { fontSize: theme.fontSize.body, fontWeight: theme.fontWeight.semibold, color: theme.color.text },
    share: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.md,
      padding: theme.spacing.md,
      borderRadius: theme.radius.xl,
      borderWidth: 1,
      borderColor: theme.color.border,
      backgroundColor: theme.color.surface,
    },
    shareOn: { backgroundColor: theme.color.accent, borderColor: theme.color.primary },
    shareIcon: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.color.background,
    },
    shareInitial: { color: theme.color.primaryText, fontWeight: theme.fontWeight.bold },
    shareText: { flex: 1, minWidth: 0 },
    shareTitle: { fontSize: theme.fontSize.body, fontWeight: theme.fontWeight.bold, color: theme.color.text },
    shareSub: { fontSize: theme.fontSize.small, color: theme.color.textMuted },
    track: { width: 52, height: 30, borderRadius: 15, backgroundColor: theme.color.border, justifyContent: "center", padding: 3 },
    trackOn: { backgroundColor: theme.color.primary },
    knob: { width: 24, height: 24, borderRadius: 12, backgroundColor: theme.color.surface },
    knobOn: { alignSelf: "flex-end" },
    noteRow: { gap: theme.spacing.sm },
    noteBtn: {
      alignSelf: "flex-start",
      minHeight: 48,
      paddingHorizontal: theme.spacing.lg,
      borderRadius: 24,
      borderWidth: 1,
      borderColor: theme.color.border,
      backgroundColor: theme.color.surface,
      alignItems: "center",
      justifyContent: "center",
    },
    noteBtnOn: { borderColor: theme.color.primary, backgroundColor: theme.color.accent },
    noteBtnLabel: { fontSize: theme.fontSize.body, fontWeight: theme.fontWeight.bold, color: theme.color.text },
    noteField: { alignSelf: "stretch" },
  });
