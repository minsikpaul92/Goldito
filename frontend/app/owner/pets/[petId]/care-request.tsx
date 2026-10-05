import { Stack, router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { ChecklistCard } from "../../../../components/ChecklistCard";
import { Button } from "../../../../components/ui/Button";
import { EmptyState } from "../../../../components/ui/EmptyState";
import { LoadingView } from "../../../../components/ui/LoadingView";
import { Screen } from "../../../../components/ui/Screen";
import { TextField } from "../../../../components/ui/TextField";
import {
  CARE_REQUEST_MAX,
  CarePlanResponse,
  DraftTask,
  draftFromPlan,
  makeCarePlan,
  saveCareRequest,
} from "../../../../features/care/carePlanApi";
import { getPet } from "../../../../features/pets/petApi";
import { useErrorDialog } from "../../../../providers/ErrorDialogProvider";
import { useThemedStyles } from "../../../../providers/ThemeProvider";
import { useToast } from "../../../../providers/ToastProvider";
import { Theme } from "../../../../theme/themes";
import type { Pet } from "../../../../types/db";

const EXAMPLE =
  "Meals: 8:00 AM — 1 cup of kibble\nMedication: 2:00 PM — 1 skin pill, hidden in a lickable treat\nHeads-up: No knocking or doorbell — text me instead.";

type Draft = { tasks: DraftTask[]; cautions: string[]; skipped: CarePlanResponse["skipped"]; model: string };

/**
 * Care request (phase-06 6.13, Stage 2-1): the owner writes the note the way they would for a
 * daycare teacher → **Make a checklist** (the AI drafts, the server enforces the pet's rules) →
 * the owner fixes it → **Save checklist** writes the note, tasks and Heads-ups together.
 */
export default function CareRequestScreen() {
  const { petId } = useLocalSearchParams<{ petId: string }>();
  const styles = useThemedStyles(makeStyles);
  const toast = useToast();
  const errorDialog = useErrorDialog();
  const [pet, setPet] = useState<Pet | null | undefined>(undefined);
  const [text, setText] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState<"making" | "saving" | null>(null);

  useEffect(() => {
    void getPet(petId).then(setPet, () => setPet(null));
  }, [petId]);

  if (pet === undefined) return <LoadingView />;
  if (!pet) {
    return (
      <Screen>
        <EmptyState emoji="🐾" title="Pet not found" message="It may have been removed." />
      </Screen>
    );
  }

  const make = async () => {
    if (busy || !text.trim()) return;
    setBusy("making");
    try {
      const plan = await makeCarePlan(pet.id, text);
      setDraft({ tasks: draftFromPlan(plan), cautions: plan.cautions, skipped: plan.skipped, model: plan.model });
    } catch (error) {
      errorDialog.show({
        title: "No checklist yet",
        message: (error as Error).message,
        onRetry: () => void make(),
      });
    } finally {
      setBusy(null);
    }
  };

  const save = async () => {
    if (!draft || busy) return;
    if (draft.tasks.some((t) => !t.title.trim())) {
      errorDialog.show({ title: "Give every task a name", message: "A task without a name can't be saved." });
      return;
    }
    if (draft.tasks.length === 0 && draft.cautions.length === 0) {
      errorDialog.show({ title: "Nothing to save", message: "Add a task or a Heads-up first, or go back." });
      return;
    }
    setBusy("saving");
    try {
      await saveCareRequest({ petId: pet.id, text, model: draft.model, tasks: draft.tasks, cautions: draft.cautions });
      const tasks = `${draft.tasks.length} task${draft.tasks.length === 1 ? "" : "s"}`;
      const heads = `${draft.cautions.length} Heads-up${draft.cautions.length === 1 ? "" : "s"}`;
      toast.show(`Saved ${tasks} and ${heads} for ${pet.name}`);
      router.back();
    } catch (error) {
      errorDialog.show({ title: "Not saved", message: (error as Error).message, onRetry: () => void save() });
    } finally {
      setBusy(null);
    }
  };

  return (
    <Screen contentStyle={styles.content} testID="care-request-screen">
      <Stack.Screen options={{ title: `${pet.name} · Care request` }} />

      <Text style={styles.intro}>
        Write it like a note to a daycare teacher — meals, medicine, times, anything to watch out for. We turn it into a
        checklist for your sitter.
      </Text>
      <TextField
        label={`Your note about ${pet.name}`}
        value={text}
        multiline
        numberOfLines={7}
        maxLength={CARE_REQUEST_MAX}
        placeholder={EXAMPLE}
        onChangeText={(v) => {
          setText(v);
          setDraft(null);
        }}
        editable={busy === null}
        testID="care-request-text"
      />
      <Text style={styles.count}>{`${text.length} / ${CARE_REQUEST_MAX}`}</Text>
      <Button
        label={busy === "making" ? "Reading your note…" : draft ? "Make it again" : "Make a checklist"}
        disabled={busy !== null || !text.trim()}
        onPress={() => void make()}
        testID="care-request-make"
      />

      {draft ? (
        <View style={styles.review}>
          <ChecklistCard
            tasks={draft.tasks}
            onTasks={(tasks) => setDraft({ ...draft, tasks })}
            cautions={draft.cautions}
            onCautions={(cautions) => setDraft({ ...draft, cautions })}
            skipped={draft.skipped}
          />
          <Text style={styles.count}>Nothing is saved until you tap Save.</Text>
          <Button
            label={busy === "saving" ? "Saving…" : "Save checklist"}
            disabled={busy !== null}
            onPress={() => void save()}
            testID="care-request-save"
          />
        </View>
      ) : null}
    </Screen>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    content: { gap: theme.spacing.sm },
    intro: { fontSize: theme.fontSize.body, color: theme.color.text, lineHeight: theme.fontSize.body * 1.4 },
    count: { fontSize: theme.fontSize.small, color: theme.color.textMuted, alignSelf: "flex-end" },
    review: { gap: theme.spacing.sm, marginTop: theme.spacing.md },
  });
