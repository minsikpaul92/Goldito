import { Stack, router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { CareLineBuilder } from "../../../../components/CareLineBuilder";
import { ChecklistCard } from "../../../../components/ChecklistCard";
import { Button } from "../../../../components/ui/Button";
import { EmptyState } from "../../../../components/ui/EmptyState";
import { LoadingView } from "../../../../components/ui/LoadingView";
import { Screen } from "../../../../components/ui/Screen";
import {
  addPetCaution,
  createCareTask,
  deleteCareTask,
  deletePetCaution,
  listPetCautions,
  updateCareTask,
} from "../../../../features/care/careApi";
import { Line, kindMeta, lineToTasks, taskSentence } from "../../../../features/care/careLines";
import { CarePlanResponse, DraftTask, makeCarePlan, sendCareChangeRequest } from "../../../../features/care/carePlanApi";
import { usePetStay } from "../../../../features/care/usePetStay";
import { getPet } from "../../../../features/pets/petApi";
import { useErrorDialog } from "../../../../providers/ErrorDialogProvider";
import { useSession } from "../../../../providers/SessionProvider";
import { useThemedStyles } from "../../../../providers/ThemeProvider";
import { useToast } from "../../../../providers/ToastProvider";
import { Theme } from "../../../../theme/themes";
import type { Pet } from "../../../../types/db";

type Draft = { tasks: DraftTask[]; cautions: string[]; skipped: CarePlanResponse["skipped"] };
type Sync = "idle" | "saving" | "saved";

const TASKS_MAX = 12;
const CAUTIONS_MAX = 8;
const UNDO_MS = 8000;

const snapshot = (t: DraftTask) => JSON.stringify([t.title.trim(), t.dose.trim(), t.time, t.notes.trim()]);

/**
 * Care checklist / care request (phase-06 6.13, redesigned 6.20). The owner builds it line by line
 * from chips; **Make a checklist** turns the lines into a table (the helper tidies each line on its
 * own, so one bad line never spoils the rest).
 * - No stay on: it is a **checklist** — every change is saved by itself ("All changes saved"), and
 *   a removed row can be brought back with Undo.
 * - A stay is on: it is a **request** — nothing changes until the sitter approves it.
 */
export default function CareRequestScreen() {
  const { petId } = useLocalSearchParams<{ petId: string }>();
  const styles = useThemedStyles(makeStyles);
  const toast = useToast();
  const errorDialog = useErrorDialog();
  const session = useSession();
  const userId = session.status === "signedIn" ? session.profile.id : null;
  const { state: stayState } = usePetStay(petId);
  const [pet, setPet] = useState<Pet | null | undefined>(undefined);
  const [lines, setLines] = useState<Line[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState<"making" | "sending" | null>(null);
  const [sync, setSync] = useState<Sync>("idle");
  const [undo, setUndo] = useState<DraftTask | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // What is already in the database: row key → id + what was last written; Heads-up text → id.
  const savedTasks = useRef(new Map<string, { id: string; snap: string }>());
  const savedCautions = useRef(new Map<string, string>());
  const running = useRef(false);
  const again = useRef(false);

  useEffect(() => {
    void getPet(petId).then(setPet, () => setPet(null));
  }, [petId]);
  useEffect(
    () => () => {
      if (undoTimer.current) clearTimeout(undoTimer.current);
    },
    [],
  );

  const stay = stayState.status === "ready" ? stayState.stay : null;
  const requestMode = stay != null;

  const runSync = useCallback(
    async (d: Draft) => {
      if (!pet || !userId) return;
      if (running.current) {
        again.current = true;
        return;
      }
      running.current = true;
      setSync("saving");
      try {
        for (const task of d.tasks) {
          const entry = savedTasks.current.get(task.key);
          const input = { title: task.title.trim(), dose: task.dose.trim() || null, time: task.time, notes: task.notes.trim() || null };
          if (!entry) {
            if (!input.title) continue; // wait until it has a name
            const row = await createCareTask(pet.id, userId, { type: task.type, repeat: task.repeat ?? true, ...input });
            savedTasks.current.set(task.key, { id: row.id, snap: snapshot(task) });
          } else if (entry.snap !== snapshot(task) && input.title) {
            await updateCareTask(entry.id, input);
            entry.snap = snapshot(task);
          }
        }
        for (const [key, entry] of [...savedTasks.current]) {
          if (d.tasks.some((t) => t.key === key)) continue;
          await deleteCareTask(entry.id);
          savedTasks.current.delete(key);
        }
        const wanted = new Set(d.cautions);
        let needIds = false;
        const tooQuick = new Set<string>(); // added and removed before its id was known
        for (const text of d.cautions) {
          if (savedCautions.current.has(text)) continue;
          await addPetCaution(pet.id, userId, text);
          savedCautions.current.set(text, "");
          needIds = true;
        }
        for (const [text, id] of [...savedCautions.current]) {
          if (wanted.has(text)) continue;
          if (id) await deletePetCaution(id);
          else tooQuick.add(text);
          savedCautions.current.delete(text);
        }
        if (needIds || tooQuick.size > 0) {
          for (const c of await listPetCautions([pet.id])) {
            if (savedCautions.current.has(c.text)) savedCautions.current.set(c.text, c.id);
            else if (tooQuick.has(c.text)) await deletePetCaution(c.id);
          }
        }
        setSync("saved");
      } catch (error) {
        setSync("idle");
        errorDialog.show({
          title: "Not saved",
          message: (error as Error).message,
          onRetry: () => void runSync(d),
        });
      } finally {
        running.current = false;
        if (again.current) {
          again.current = false;
          if (latest.current) void runSync(latest.current);
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pet, userId],
  );
  const latest = useRef<Draft | null>(null);
  latest.current = draft;

  // Checklist mode: every change is saved a moment after it is made.
  useEffect(() => {
    if (!draft || requestMode) return;
    setSync("saving");
    const timer = setTimeout(() => void runSync(draft), 400);
    return () => clearTimeout(timer);
  }, [draft, requestMode, runSync]);

  if (pet === undefined || stayState.status === "loading") return <LoadingView />;
  if (!pet) {
    return (
      <Screen>
        <EmptyState emoji="🐾" title="Pet not found" message="It may have been removed." />
      </Screen>
    );
  }

  const make = async () => {
    if (busy || lines.length === 0) return;
    setBusy("making");
    try {
      const rows = lines.flatMap(lineToTasks);
      const heads = lines.filter((l) => kindMeta(l.kind).type === null).map((l) => l.text.trim());
      const skipped: CarePlanResponse["skipped"] = [];
      // The helper tidies each task on its own; if it can't (or says no), the owner's own words stay.
      const refined = await Promise.all(
        rows.map(async (row) => {
          const line = lines.find((l) => row.key.startsWith(`${l.key}-`));
          if (!line) return row;
          try {
            const plan = await makeCarePlan(pet.id, taskSentence(line, row.time));
            skipped.push(...plan.skipped);
            const one = plan.tasks.length === 1 && plan.tasks[0].type === row.type ? plan.tasks[0] : null;
            if (!one) return row;
            const single = !/\d\/\d$/.test(row.title);
            return {
              ...row,
              title: single ? one.title : row.title,
              dose: (one.dose ?? row.dose).slice(0, 60),
              notes: one.notes ?? "",
            };
          } catch {
            return row;
          }
        }),
      );
      const existing = draft ?? { tasks: [], cautions: [], skipped: [] };
      const tasks = [...existing.tasks, ...refined];
      const cautions = [...existing.cautions, ...heads.filter((h) => !existing.cautions.some((c) => c.toLowerCase() === h.toLowerCase()))];
      if (tasks.length > TASKS_MAX || cautions.length > CAUTIONS_MAX) {
        errorDialog.show({
          title: "That's a lot for one list",
          message: `A checklist holds ${TASKS_MAX} tasks and ${CAUTIONS_MAX} Heads-ups at most. Remove a line and try again.`,
        });
        return;
      }
      setDraft({ tasks, cautions, skipped: [...existing.skipped, ...skipped] });
      setLines([]);
    } finally {
      setBusy(null);
    }
  };

  const onTasks = (next: DraftTask[]) => {
    if (!draft) return;
    const removed = draft.tasks.filter((t) => !next.some((n) => n.key === t.key));
    if (removed.length === 1 && !requestMode) {
      setUndo(removed[0]);
      if (undoTimer.current) clearTimeout(undoTimer.current);
      undoTimer.current = setTimeout(() => setUndo(null), UNDO_MS);
    }
    setDraft({ ...draft, tasks: next });
  };

  const restore = () => {
    if (!undo || !draft) return;
    const row = undo;
    setUndo(null);
    setDraft({ ...draft, tasks: [...draft.tasks, row].sort((a, b) => a.time.localeCompare(b.time)) });
  };

  const send = async () => {
    if (!draft || busy || !stay) return;
    if (draft.tasks.some((t) => !t.title.trim())) {
      errorDialog.show({ title: "Give every task a name", message: "A task without a name can't be sent." });
      return;
    }
    if (draft.tasks.length === 0 && draft.cautions.length === 0) {
      errorDialog.show({ title: "Nothing to send", message: "Add a task or a Heads-up first." });
      return;
    }
    setBusy("sending");
    try {
      await sendCareChangeRequest(pet.id, draft.tasks, draft.cautions);
      toast.show(`Request sent to ${stay.sitterName}`);
      router.back();
    } catch (error) {
      errorDialog.show({ title: "Not sent", message: (error as Error).message, onRetry: () => void send() });
    } finally {
      setBusy(null);
    }
  };

  const pending = stayState.status === "ready" ? stayState.request?.status === "pending" : false;

  return (
    <Screen contentStyle={styles.content} testID="care-request-screen">
      <Stack.Screen options={{ title: `${pet.name} · ${requestMode ? "Care request" : "Care checklist"}` }} />

      <Text style={styles.heading} accessibilityRole="header" testID="care-request-heading">
        {requestMode ? "Write a care request" : "Write a care checklist"}
      </Text>
      <Text style={styles.intro}>
        {requestMode
          ? `${stay.sitterName} is caring for ${pet.name}. Build your request — it only takes effect once ${stay.sitterName} approves it.`
          : `Build it one line at a time. Your sitter can read it before deciding on the booking, and every change is saved by itself.`}
      </Text>

      {pending ? (
        <View style={styles.notice} testID="request-pending">
          <Text style={styles.noticeText}>{`Your last request is still waiting for ${stay?.sitterName ?? "your sitter"}. You can send another once it is answered.`}</Text>
        </View>
      ) : null}

      <CareLineBuilder species={pet.species} lines={lines} onLines={setLines} disabled={busy !== null} />
      <Button
        label={busy === "making" ? "Making your checklist…" : draft ? "Add to the checklist" : "Make a checklist"}
        disabled={busy !== null || lines.length === 0}
        onPress={() => void make()}
        testID="care-request-make"
      />

      {draft ? (
        <View style={styles.review}>
          {!requestMode ? (
            <Text style={[styles.saveState, sync === "saved" && styles.saveStateOk]} testID="save-state">
              {sync === "saving" ? "Saving…" : sync === "saved" ? "✓ All changes saved" : " "}
            </Text>
          ) : null}
          <ChecklistCard
            tasks={draft.tasks}
            onTasks={onTasks}
            cautions={draft.cautions}
            onCautions={(cautions) => setDraft({ ...draft, cautions })}
            skipped={draft.skipped}
          />
          {requestMode ? (
            <>
              <Text style={styles.count}>{`Nothing changes until ${stay.sitterName} approves.`}</Text>
              <Button
                label={busy === "sending" ? "Sending…" : `Send request to ${stay.sitterName}`}
                disabled={busy !== null || pending}
                onPress={() => void send()}
                testID="care-request-send"
              />
            </>
          ) : (
            <Button label="Done" onPress={() => router.back()} disabled={sync === "saving"} testID="care-request-done" />
          )}
        </View>
      ) : null}

      {undo ? (
        <View style={styles.undo} testID="undo-bar">
          <Text style={styles.undoText}>{`Removed ${undo.title || "a task"}`}</Text>
          <Pressable accessibilityRole="button" onPress={restore} testID="undo-restore">
            <Text style={styles.undoAction}>Undo</Text>
          </Pressable>
        </View>
      ) : null}
    </Screen>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    content: { gap: theme.spacing.sm },
    heading: { fontSize: theme.fontSize.title, fontWeight: "700", color: theme.color.text },
    intro: { fontSize: theme.fontSize.body, color: theme.color.text, lineHeight: theme.fontSize.body * 1.4 },
    count: { fontSize: theme.fontSize.small, color: theme.color.textMuted, alignSelf: "flex-end" },
    review: { gap: theme.spacing.sm, marginTop: theme.spacing.md },
    notice: { padding: theme.spacing.sm, borderRadius: theme.radius.md, backgroundColor: theme.color.accent, borderWidth: 1, borderColor: theme.color.warning },
    noticeText: { fontSize: theme.fontSize.small, color: theme.color.text },
    saveState: { fontSize: theme.fontSize.small, fontWeight: "600", color: theme.color.textMuted, alignSelf: "flex-end" },
    saveStateOk: { color: theme.color.primary },
    undo: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      padding: theme.spacing.md,
      borderRadius: theme.radius.md,
      backgroundColor: theme.color.text,
    },
    undoText: { fontSize: theme.fontSize.body, color: theme.color.surface },
    undoAction: { fontSize: theme.fontSize.body, fontWeight: "700", color: theme.color.accent },
  });
