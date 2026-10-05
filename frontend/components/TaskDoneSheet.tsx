import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { completeTaskLog } from "../features/care/careApi";
import { MEMO_MAX } from "../features/care/checkinOptions";
import type { TaskItem } from "../features/care/useTodayTasks";
import { formatTime, isoToZoned } from "../features/schedule/dates";
import { UploadError, uploadMedia } from "../lib/cloudinary";
import { pickMedia, type PickedMedia } from "../lib/media";
import { useErrorDialog } from "../providers/ErrorDialogProvider";
import { useThemedStyles } from "../providers/ThemeProvider";
import { useToast } from "../providers/ToastProvider";
import { Theme } from "../theme/themes";
import { Button } from "./ui/Button";
import { Sheet } from "./ui/Sheet";
import { TextButton } from "./ui/TextButton";
import { TextField } from "./ui/TextField";

type Props = {
  item: TaskItem | null;
  onClose: () => void;
  /** Called after the task is marked done (refresh the list). */
  onDone: () => void;
};

/**
 * "Done" on a task opens this: an optional memo for anything special, an optional photo (take or
 * choose, then check it), and one **Done** that sends it. No memo → the owner gets a preset line;
 * a memo → only the memo. Errors stay in a dialog and the sheet keeps what was typed.
 */
export function TaskDoneSheet({ item, onClose, onDone }: Props) {
  const styles = useThemedStyles(makeStyles);
  const toast = useToast();
  const errorDialog = useErrorDialog();
  const [memo, setMemo] = useState("");
  const [photo, setPhoto] = useState<PickedMedia | null>(null);
  const [step, setStep] = useState<"idle" | "uploading" | "sending">("idle");

  useEffect(() => {
    if (item) {
      setMemo("");
      setPhoto(null);
      setStep("idle");
    }
  }, [item?.log.id]);

  const busy = step !== "idle";

  const submit = async () => {
    if (!item || busy) return;
    try {
      let mediaId: string | null = null;
      if (photo) {
        setStep("uploading");
        const uploaded = await uploadMedia({
          petId: item.pet.id,
          purpose: "task_proof",
          file: photo.file,
          resourceType: "image",
        });
        mediaId = uploaded.mediaId;
      }
      setStep("sending");
      await completeTaskLog(item.log.id, mediaId, memo.trim() || null);
      toast.show(`${item.task.title} done ✅ ${item.pet.ownerName} was told`);
      onClose();
      onDone();
    } catch (error) {
      errorDialog.show({
        title: "Not marked done",
        message: error instanceof UploadError || error instanceof Error ? error.message : "Try again.",
        onRetry: () => void submit(),
      });
    } finally {
      setStep("idle");
    }
  };

  const addPhoto = async () => {
    if (busy) return;
    const picked = await pickMedia({ purpose: "task_proof", confirm: true, confirmLabel: "Use this photo" });
    if (picked) setPhoto(picked);
  };

  return (
    <Sheet
      visible={item != null}
      title={item ? `Done: ${item.task.title}` : ""}
      onClose={() => {
        if (!busy) onClose();
      }}
      testID="task-done-sheet"
      footer={
        <Button
          label={step === "uploading" ? "Uploading photo…" : step === "sending" ? "Sending…" : "Done"}
          disabled={busy}
          onPress={() => void submit()}
          testID="task-done-confirm"
        />
      }
    >
      {item ? (
        <Text style={styles.meta}>
          {[item.pet.name, formatTime(isoToZoned(item.log.due_at).time), item.task.dose].filter(Boolean).join(" · ")}
        </Text>
      ) : null}
      <TextField
        label="Anything special? (optional)"
        value={memo}
        maxLength={MEMO_MAX}
        placeholder={`Skip it and a preset update goes to ${item?.pet.ownerName ?? "the owner"}`}
        onChangeText={setMemo}
        testID="task-done-memo"
      />
      <View style={styles.photoRow}>
        <Pressable
          accessibilityRole="button"
          disabled={busy}
          onPress={() => void addPhoto()}
          style={({ pressed }) => [styles.pill, pressed && styles.pressed]}
          testID="task-done-photo"
        >
          <Text style={styles.pillText}>{photo ? "📷 Photo ready ✓" : "📷 Add photo"}</Text>
        </Pressable>
        {photo ? <TextButton label="Remove" onPress={() => setPhoto(null)} testID="task-done-photo-remove" /> : null}
      </View>
    </Sheet>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    meta: { fontSize: theme.fontSize.small, color: theme.color.textMuted },
    photoRow: { flexDirection: "row", alignItems: "center", gap: theme.spacing.xs },
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
    pressed: { opacity: 0.6 },
    pillText: { fontSize: theme.fontSize.small, fontWeight: "600", color: theme.color.primary },
  });
