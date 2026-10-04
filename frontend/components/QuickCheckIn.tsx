import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { logCareCheckin } from "../features/care/careApi";
import { MEMO_MAX, groupsFor } from "../features/care/checkinOptions";
import { UploadError, uploadMedia } from "../lib/cloudinary";
import { pickMedia, type PickedMedia } from "../lib/media";
import { useThemedStyles } from "../providers/ThemeProvider";
import { useToast } from "../providers/ToastProvider";
import { Theme } from "../theme/themes";
import type { CareCheckinKind, Species } from "../types/db";
import { Card } from "./ui/Card";
import { TextButton } from "./ui/TextButton";
import { TextField } from "./ui/TextField";

type Props = {
  pet: { id: string; name: string; species: Species; ownerName: string };
};

/**
 * The 5-second check (phase-06 6.10): one tap per check-in, no typing needed. A tap with the memo
 * empty tells the owner a preset line ("Max ate everything"); if the sitter typed a memo for
 * something special, the owner gets only that memo. A photo can ride along (📷).
 */
export function QuickCheckIn({ pet }: Props) {
  const styles = useThemedStyles(makeStyles);
  const toast = useToast();
  const [memo, setMemo] = useState("");
  const [photo, setPhoto] = useState<PickedMedia | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async (kind: CareCheckinKind, value: string | null) => {
    if (sending) return;
    const note = memo.trim() || null;
    if (kind === "note" && !note) {
      setError("Type a note first.");
      return;
    }
    setError(null);
    setSending(true);
    try {
      let mediaId: string | null = null;
      if (photo) {
        const uploaded = await uploadMedia({
          petId: pet.id,
          purpose: "task_proof",
          file: photo.file,
          resourceType: "image",
        });
        mediaId = uploaded.mediaId;
      }
      await logCareCheckin({ petId: pet.id, kind, value, note, mediaId });
      toast.show(`Sent ✅ ${pet.ownerName} was told`);
      setMemo("");
      setPhoto(null);
    } catch (e) {
      toast.show(e instanceof UploadError || e instanceof Error ? e.message : "Try again.");
    } finally {
      setSending(false);
    }
  };

  const attachPhoto = async () => {
    if (sending) return;
    const picked = await pickMedia({ purpose: "task_proof", confirm: true, confirmLabel: "Use this photo" });
    if (picked) setPhoto(picked);
  };

  return (
    <Card style={styles.card} testID={`checkin-${pet.id}`}>
      <Text style={styles.title}>{pet.name}</Text>

      {groupsFor(pet.species).map((group) => (
        <View key={group.kind} style={styles.group}>
          <Text style={styles.groupLabel}>{`${group.emoji} ${group.label}`}</Text>
          <View style={styles.pills}>
            {group.options.map((option) => (
              <Pressable
                key={option.value}
                accessibilityRole="button"
                accessibilityLabel={`${group.label}: ${option.label}`}
                disabled={sending}
                onPress={() => void send(group.kind, option.value)}
                style={({ pressed }) => [styles.pill, (pressed || sending) && styles.pillPressed]}
                testID={`checkin-${pet.id}-${group.kind}-${option.value}`}
              >
                <Text style={styles.pillText}>{option.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ))}

      <TextField
        label="Anything special? (optional)"
        value={memo}
        maxLength={MEMO_MAX}
        placeholder="Skip it and a preset update goes to the owner"
        onChangeText={(v) => {
          setMemo(v);
          setError(null);
        }}
        error={error}
        testID={`checkin-memo-${pet.id}`}
      />
      <View style={styles.extras}>
        <Pressable
          accessibilityRole="button"
          disabled={sending}
          onPress={() => void attachPhoto()}
          style={({ pressed }) => [styles.pill, pressed && styles.pillPressed]}
          testID={`checkin-photo-${pet.id}`}
        >
          <Text style={styles.pillText}>{photo ? "📷 Photo ready ✓" : "📷 Add photo"}</Text>
        </Pressable>
        {photo ? (
          <TextButton label="Remove photo" onPress={() => setPhoto(null)} testID={`checkin-photo-remove-${pet.id}`} />
        ) : null}
        <Pressable
          accessibilityRole="button"
          disabled={sending}
          onPress={() => void send("note", null)}
          style={({ pressed }) => [styles.pill, styles.noteButton, pressed && styles.pillPressed]}
          testID={`checkin-note-${pet.id}`}
        >
          <Text style={styles.pillText}>📝 Send as a note</Text>
        </Pressable>
      </View>
    </Card>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    card: { gap: theme.spacing.sm },
    title: { fontSize: theme.fontSize.body, fontWeight: "700", color: theme.color.text },
    group: { gap: theme.spacing.xs },
    groupLabel: { fontSize: theme.fontSize.small, fontWeight: "600", color: theme.color.textMuted },
    pills: { flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.xs },
    pill: {
      minHeight: 44,
      paddingHorizontal: theme.spacing.md,
      borderRadius: 22,
      borderWidth: 1,
      borderColor: theme.color.primary,
      backgroundColor: theme.color.accent,
      alignItems: "center",
      justifyContent: "center",
    },
    pillPressed: { opacity: 0.6 },
    pillText: { fontSize: theme.fontSize.small, fontWeight: "600", color: theme.color.primary },
    extras: { flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.xs, alignItems: "center" },
    noteButton: { backgroundColor: theme.color.surface },
  });
