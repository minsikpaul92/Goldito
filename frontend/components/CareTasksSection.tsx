import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import {
  CareTaskInput,
  createCareTask,
  deleteCareTask,
  listCareTasks,
  listTodayTaskLogs,
  setCareTaskActive,
  updateCareTask,
} from "../features/care/careApi";
import {
  careTypeMeta,
  sortTasks,
  statusLabel,
  todayStatus,
  typesForSpecies,
} from "../features/care/careFormat";
import { formatTime } from "../features/schedule/dates";
import { useThemedStyles } from "../providers/ThemeProvider";
import { useToast } from "../providers/ToastProvider";
import { Theme } from "../theme/themes";
import type { CareTaskRow, CareTaskType, Pet, TaskLogRow } from "../types/db";
import { Button } from "./ui/Button";
import { Card } from "./ui/Card";
import { Sheet } from "./ui/Sheet";
import { TimePickerSheet } from "./ui/TimePickerSheet";
import { TextButton } from "./ui/TextButton";
import { TextField } from "./ui/TextField";

type Props = {
  pet: Pick<Pet, "id" | "name" | "species">;
  userId: string;
};

type State =
  | { status: "loading" }
  | { status: "ready"; tasks: CareTaskRow[]; logs: TaskLogRow[] }
  | { status: "error"; message: string };

const TITLE_MAX = 60;
const DOSE_MAX = 60;
const NOTES_MAX = 200;

/**
 * Owner's care tasks on the pet detail screen (phase-06 6.1): what the sitter should do each
 * day (meds, meals, walks…), with today's status once the sitter side starts logging (6.2+).
 */
export function CareTasksSection({ pet, userId }: Props) {
  const styles = useThemedStyles(makeStyles);
  const toast = useToast();
  const [state, setState] = useState<State>({ status: "loading" });
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<CareTaskRow | null>(null);
  const [pendingDelete, setPendingDelete] = useState<CareTaskRow | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [tasks, logs] = await Promise.all([listCareTasks(pet.id), listTodayTaskLogs(pet.id)]);
      setState({ status: "ready", tasks, logs });
    } catch (error) {
      setState({ status: "error", message: (error as Error).message });
    }
  }, [pet.id]);

  // Also when we come back from the care request screen with new tasks.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const tasks = state.status === "ready" ? sortTasks(state.tasks) : [];
  const logByTask = useMemo(() => {
    const map = new Map<string, TaskLogRow>();
    if (state.status === "ready") for (const log of state.logs) map.set(log.task_id, log);
    return map;
  }, [state]);

  const toggleActive = async (task: CareTaskRow) => {
    if (busy) return;
    setBusy(true);
    try {
      await setCareTaskActive(task.id, !task.active);
      toast.show(task.active ? `Paused ${task.title}` : `${task.title} is back on`);
      await load();
    } catch (error) {
      toast.show((error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = async () => {
    if (!pendingDelete || busy) return;
    setBusy(true);
    try {
      await deleteCareTask(pendingDelete.id);
      toast.show(`Deleted ${pendingDelete.title}`);
      setPendingDelete(null);
      await load();
    } catch (error) {
      toast.show((error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.section} testID="care-tasks">
      <View style={styles.header}>
        <Text accessibilityRole="header" style={styles.heading}>
          Care tasks
        </Text>
        <Button label="Add task" variant="secondary" onPress={() => setAdding(true)} testID="care-add" />
      </View>
      <Text style={styles.hint}>What {pet.name}&apos;s sitter should do each day.</Text>
      <Button
        label="✍️ Write a care request"
        variant="secondary"
        onPress={() => router.push(`/owner/pets/${pet.id}/care-request`)}
        testID="care-request-open"
      />

      {state.status === "loading" ? <Text style={styles.muted}>Loading…</Text> : null}
      {state.status === "error" ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{state.message}</Text>
          <TextButton label="Try again" onPress={() => void load()} testID="care-retry" />
        </View>
      ) : null}
      {state.status === "ready" && tasks.length === 0 ? (
        <Text style={styles.muted} testID="care-empty">
          No tasks yet — add a medication, meal or walk and your sitter will see it.
        </Text>
      ) : null}

      {tasks.map((task) => {
        const meta = careTypeMeta(task.type);
        const status = task.active ? statusLabel(todayStatus(logByTask.get(task.id))) : null;
        return (
          <Card key={task.id} testID={`care-task-${task.id}`} style={task.active ? undefined : styles.paused}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Open ${task.title}`}
              onPress={() => setEditing(task)}
              style={({ pressed }) => [styles.row, pressed && styles.pressed]}
              testID={`care-task-open-${task.id}`}
            >
              <Text style={styles.emoji} accessibilityElementsHidden>
                {meta.emoji}
              </Text>
              <View style={styles.rowBody}>
                <Text style={styles.title}>{task.title}</Text>
                <Text style={styles.meta}>
                  {[formatTime(task.scheduled_time), "every day", task.dose].filter(Boolean).join(" · ")}
                </Text>
                {task.notes ? <Text style={styles.meta}>{task.notes}</Text> : null}
                {!task.active ? <Text style={styles.badge}>Paused</Text> : null}
                {status ? (
                  <Text style={styles.badge} testID={`care-status-${task.id}`}>
                    {status}
                  </Text>
                ) : null}
              </View>
              <Text style={styles.chevron} accessibilityElementsHidden>
                ›
              </Text>
            </Pressable>
            <View style={styles.actions}>
              <TextButton
                label={task.active ? "Pause" : "Resume"}
                onPress={() => void toggleActive(task)}
                disabled={busy}
                testID={`care-toggle-${task.id}`}
              />
              <TextButton
                label="Delete"
                danger
                onPress={() => setPendingDelete(task)}
                disabled={busy}
                testID={`care-delete-${task.id}`}
              />
            </View>
          </Card>
        );
      })}

      <TaskSheet
        visible={adding || editing != null}
        pet={pet}
        task={editing}
        onClose={() => {
          setAdding(false);
          setEditing(null);
        }}
        onSave={async (input) => {
          if (editing) {
            const timeChanged = editing.scheduled_time.slice(0, 5) !== input.time;
            await updateCareTask(editing.id, input);
            toast.show(timeChanged ? `Saved — now at ${formatTime(input.time)}` : `Saved ${input.title}`);
            setEditing(null);
          } else {
            await createCareTask(pet.id, userId, input);
            toast.show(`Added ${input.title}`);
            setAdding(false);
          }
          await load();
        }}
      />

      <Sheet
        visible={pendingDelete != null}
        title="Delete this task?"
        onClose={() => {
          if (!busy) setPendingDelete(null);
        }}
        testID="care-delete-sheet"
        footer={
          <Button
            label={busy ? "Deleting…" : "Delete task"}
            disabled={busy}
            onPress={() => void confirmDelete()}
            testID="care-delete-confirm"
          />
        }
      >
        <Text style={styles.body}>
          {pendingDelete
            ? `${pendingDelete.title} and its history will be removed. To stop it for now, use Pause instead.`
            : ""}
        </Text>
      </Sheet>
    </View>
  );
}

function TaskSheet({
  visible,
  pet,
  task,
  onClose,
  onSave,
}: {
  visible: boolean;
  pet: Props["pet"];
  /** Set to edit that task (its type stays fixed); empty to add a new one. */
  task: CareTaskRow | null;
  onClose: () => void;
  onSave: (input: CareTaskInput) => Promise<void>;
}) {
  const styles = useThemedStyles(makeStyles);
  const allowed = typesForSpecies(pet.species);
  const [type, setType] = useState<CareTaskType>(allowed[0].type);
  const [title, setTitle] = useState(allowed[0].label);
  const [titleEdited, setTitleEdited] = useState(false);
  const [dose, setDose] = useState("");
  const [notes, setNotes] = useState("");
  const [time, setTime] = useState("08:00");
  const [pickingTime, setPickingTime] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setType(task?.type ?? allowed[0].type);
    setTitle(task?.title ?? allowed[0].label);
    setTitleEdited(task != null);
    setDose(task?.dose ?? "");
    setNotes(task?.notes ?? "");
    setTime(task ? task.scheduled_time.slice(0, 5) : "08:00");
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const pick = (next: CareTaskType) => {
    setType(next);
    if (!titleEdited) setTitle(careTypeMeta(next).label);
  };

  const submit = async () => {
    const cleanTitle = title.trim();
    if (!cleanTitle) {
      setError("Give the task a name.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave({
        type,
        title: cleanTitle,
        dose: type === "medication" && dose.trim() ? dose.trim() : null,
        time,
        notes: notes.trim() || null,
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      visible={visible}
      title={task ? "Edit task" : "Add a care task"}
      onClose={() => {
        if (!saving) onClose();
      }}
      testID="care-sheet"
      footer={
        <Button label={saving ? "Saving…" : task ? "Save changes" : "Save task"} disabled={saving} onPress={() => void submit()} testID="care-save" />
      }
    >
      {task ? (
        <View testID="care-type-locked">
          <View style={[styles.pill, styles.pillOn, styles.pillLocked]}>
            <Text style={[styles.pillText, styles.pillTextOn]}>
              {careTypeMeta(task.type).emoji} {careTypeMeta(task.type).label}
            </Text>
          </View>
          <Text style={styles.hint}>The type can&apos;t change — delete this task and add a new one instead.</Text>
        </View>
      ) : (
      <View style={styles.pills} accessibilityRole="radiogroup">
        {allowed.map((t) => (
          <Pressable
            key={t.type}
            accessibilityRole="radio"
            // react-native-web ignores accessibilityState.checked; aria-checked reaches the DOM.
            aria-checked={type === t.type}
            onPress={() => pick(t.type)}
            style={[styles.pill, type === t.type && styles.pillOn]}
            testID={`care-type-${t.type}`}
          >
            <Text style={[styles.pillText, type === t.type && styles.pillTextOn]}>
              {t.emoji} {t.label}
            </Text>
          </Pressable>
        ))}
      </View>
      )}

      <TextField
        label="Name"
        value={title}
        maxLength={TITLE_MAX}
        onChangeText={(v) => {
          setTitle(v);
          setTitleEdited(true);
        }}
        testID="care-title"
      />
      {type === "medication" ? (
        <TextField
          label="Dose (optional)"
          value={dose}
          maxLength={DOSE_MAX}
          placeholder="e.g. 1 tablet with food"
          onChangeText={setDose}
          testID="care-dose"
        />
      ) : null}
      <Text style={styles.label}>Time (every day)</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Task time ${formatTime(time)}, tap to change`}
        onPress={() => setPickingTime(true)}
        style={({ pressed }) => [styles.timeButton, pressed && styles.pressed]}
        testID="care-time"
      >
        <Text style={styles.timeText} testID="care-time-value">
          {formatTime(time)}
        </Text>
        <Text style={styles.chevron}>▾</Text>
      </Pressable>
      <TimePickerSheet
        visible={pickingTime}
        value={time}
        title="Task time (every day)"
        onClose={() => setPickingTime(false)}
        onPick={(next) => {
          setTime(next);
          setPickingTime(false);
        }}
      />
      <TextField
        label="Note for the sitter (optional)"
        value={notes}
        maxLength={NOTES_MAX}
        onChangeText={setNotes}
        testID="care-notes"
      />
      {error ? (
        <Text style={styles.errorText} testID="care-error">
          {error}
        </Text>
      ) : null}
    </Sheet>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    section: { marginTop: theme.spacing.lg, gap: theme.spacing.sm },
    header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    heading: { fontSize: theme.fontSize.title, fontWeight: "700", color: theme.color.text },
    hint: { fontSize: theme.fontSize.small, color: theme.color.textMuted },
    muted: { fontSize: theme.fontSize.body, color: theme.color.textMuted },
    body: { fontSize: theme.fontSize.body, color: theme.color.text, lineHeight: theme.fontSize.body * 1.4 },
    label: { fontSize: theme.fontSize.small, fontWeight: "600", color: theme.color.text },
    errorBox: { gap: theme.spacing.xs },
    errorText: { fontSize: theme.fontSize.small, color: theme.color.error },
    paused: { opacity: 0.6 },
    row: { flexDirection: "row", gap: theme.spacing.sm },
    rowBody: { flex: 1, gap: 2 },
    emoji: { fontSize: 24 },
    title: { fontSize: theme.fontSize.body, fontWeight: "700", color: theme.color.text },
    meta: { fontSize: theme.fontSize.small, color: theme.color.textMuted },
    badge: { fontSize: theme.fontSize.small, fontWeight: "600", color: theme.color.text },
    actions: { flexDirection: "row", justifyContent: "flex-end" },
    pills: { flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.xs },
    pill: {
      minHeight: 40,
      paddingHorizontal: theme.spacing.md,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: theme.color.border,
      backgroundColor: theme.color.surface,
      justifyContent: "center",
    },
    pillLocked: { alignSelf: "flex-start" },
    pressed: { opacity: 0.8 },
    chevron: { fontSize: 22, color: theme.color.textMuted, alignSelf: "center" },
    timeButton: {
      minHeight: 48,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: theme.spacing.md,
      borderRadius: theme.radius.md,
      borderWidth: 1,
      borderColor: theme.color.border,
      backgroundColor: theme.color.surface,
    },
    timeText: { fontSize: theme.fontSize.body, fontWeight: "700", color: theme.color.text },
    pillOn: { borderColor: theme.color.primary, backgroundColor: theme.color.accent },
    pillText: { fontSize: theme.fontSize.small, color: theme.color.textMuted, fontWeight: "600" },
    pillTextOn: { color: theme.color.text },
  });
