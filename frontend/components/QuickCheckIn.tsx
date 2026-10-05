import { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { SentCheckin, listTodayCheckins, logCareCheckin } from "../features/care/careApi";
import { MEMO_MAX, groupsFor } from "../features/care/checkinOptions";
import { checkinLabel } from "../features/diary/diaryApi";
import { formatTime, isoToZoned } from "../features/schedule/dates";
import { UploadError, uploadMedia } from "../lib/cloudinary";
import { pickMedia, type PickedMedia } from "../lib/media";
import { useErrorDialog } from "../providers/ErrorDialogProvider";
import { useThemedStyles } from "../providers/ThemeProvider";
import { useToast } from "../providers/ToastProvider";
import { Theme } from "../theme/themes";
import type { CareCheckinKind, Species } from "../types/db";
import { Button } from "./ui/Button";
import { Card } from "./ui/Card";
import { TextButton } from "./ui/TextButton";
import { TextField } from "./ui/TextField";

type Props = {
  pet: { id: string; name: string; species: Species; ownerName: string };
};

/**
 * The 5-second check (phase-06 6.10): tap what happened, then **Send**. With the memo empty the owner
 * gets a preset line ("Max ate everything"); a memo typed for something special replaces it. A photo
 * can ride along (📷). A memo alone (nothing picked) is sent as a note.
 */
export function QuickCheckIn({ pet }: Props) {
  const styles = useThemedStyles(makeStyles);
  const toast = useToast();
  const errorDialog = useErrorDialog();
  const [sent, setSent] = useState<SentCheckin[]>([]);
  /** The option picked but not sent yet (`meal:all`); tapping it again unpicks it. */
  const [picked, setPicked] = useState<{ kind: CareCheckinKind; value: string } | null>(null);
  const [memo, setMemo] = useState("");
  const [photo, setPhoto] = useState<PickedMedia | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadSent = useCallback(async () => {
    try {
      setSent(await listTodayCheckins(pet.id));
    } catch {
      // The strip is a convenience; a failed refresh must not block sending.
    }
  }, [pet.id]);

  useEffect(() => {
    void loadSent();
  }, [loadSent]);

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
      setPicked(null);
      void loadSent();
    } catch (e) {
      errorDialog.show({
        title: "Not sent",
        message: e instanceof UploadError || e instanceof Error ? e.message : "Try again.",
        onRetry: () => void send(kind, value),
      });
    } finally {
      setSending(false);
    }
  };

  const sendPicked = () => {
    if (picked) void send(picked.kind, picked.value);
    else void send("note", null);
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
            {group.options.map((option) => {
              const on = picked?.kind === group.kind && picked.value === option.value;
              return (
                <Pressable
                  key={option.value}
                  accessibilityRole="button"
                  accessibilityLabel={`${group.label}: ${option.label}`}
                  aria-pressed={on}
                  disabled={sending}
                  onPress={() => setPicked(on ? null : { kind: group.kind, value: option.value })}
                  style={({ pressed }) => [styles.pill, on && styles.pillSent, pressed && styles.pillPressed]}
                  testID={`checkin-${pet.id}-${group.kind}-${option.value}`}
                >
                  <Text style={[styles.pillText, on && styles.pillTextSent]}>{on ? `✓ ${option.label}` : option.label}</Text>
                </Pressable>
              );
            })}
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
      </View>
      <Text style={styles.groupLabel} testID={`checkin-picked-${pet.id}`}>
        {picked
          ? `Ready to send: ${checkinLabel(picked.kind, picked.value).emoji} ${checkinLabel(picked.kind, picked.value).label}`
          : memo.trim()
            ? "Ready to send as a note"
            : "Pick what happened, add a memo or photo if you like, then Send."}
      </Text>
      <Button
        label={sending ? "Sending…" : "Send"}
        disabled={sending || (!picked && !memo.trim())}
        onPress={sendPicked}
        testID={`checkin-send-${pet.id}`}
      />
      {sent.length > 0 ? (
        <View style={styles.sentBox} testID={`checkin-sent-${pet.id}`}>
          <Text style={styles.groupLabel}>{`Sent to ${pet.ownerName} today`}</Text>
          {sent.slice(0, 4).map((c) => {
            const { emoji, label } = checkinLabel(c.kind, c.value);
            return (
              <Text key={c.id} style={styles.sentLine} testID={`checkin-sent-item-${c.id}`}>
                {`${emoji} ${label}${c.note ? ` · “${c.note}”` : ""} · ${formatTime(isoToZoned(c.at).time)}`}
              </Text>
            );
          })}
          {sent.length > 4 ? <Text style={styles.groupLabel}>{`+ ${sent.length - 4} earlier`}</Text> : null}
        </View>
      ) : null}
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
    pillSent: { backgroundColor: theme.color.primary },
    pillTextSent: { color: theme.color.primaryText },
    sentBox: { gap: 2, paddingTop: theme.spacing.xs, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.color.border },
    sentLine: { fontSize: theme.fontSize.small, color: theme.color.text },
    pillText: { fontSize: theme.fontSize.small, fontWeight: "600", color: theme.color.primary },
    extras: { flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.xs, alignItems: "center" },
  });
