import { Stack, router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Button } from "../../../components/ui/Button";
import { Card } from "../../../components/ui/Card";
import { EmptyState } from "../../../components/ui/EmptyState";
import { LoadingView } from "../../../components/ui/LoadingView";
import { Screen } from "../../../components/ui/Screen";
import { Sheet } from "../../../components/ui/Sheet";
import { TextField } from "../../../components/ui/TextField";
import { careTypeMeta } from "../../../features/care/careFormat";
import {
  ChangeRequest,
  counterCareChangeRequest,
  formatFee,
  getChangeRequest,
  respondCareChangeRequest,
} from "../../../features/care/carePlanApi";
import { formatTime } from "../../../features/schedule/dates";
import { useErrorDialog } from "../../../providers/ErrorDialogProvider";
import { useThemedStyles } from "../../../providers/ThemeProvider";
import { useToast } from "../../../providers/ToastProvider";
import { Theme } from "../../../theme/themes";

const NOTE_MAX = 200;

/** Polite reasons for a "no" — the owner sees the one chosen, plus a nudge to message the sitter. */
export const DECLINE_REASONS = ["I can't fit this in today", "Let's talk first", "Needs a different time"];

/** The sitter reads an owner's care request while a stay is on, then approves or declines it. */
export default function SitterCareRequest() {
  const { requestId } = useLocalSearchParams<{ requestId: string }>();
  const styles = useThemedStyles(makeStyles);
  const toast = useToast();
  const errorDialog = useErrorDialog();
  const [request, setRequest] = useState<(ChangeRequest & { petName: string }) | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [fee, setFee] = useState("");
  const [ownerTasks, setOwnerTasks] = useState<number[]>([]);

  useEffect(() => {
    void getChangeRequest(requestId).then(setRequest, () => setRequest(null));
  }, [requestId]);

  if (request === undefined) return <LoadingView />;
  if (!request) {
    return (
      <Screen>
        <EmptyState emoji="📝" title="Request not found" message="It may have been withdrawn." />
      </Screen>
    );
  }

  const done = (message: string) => {
    toast.show(message);
    setDeclining(false);
    router.back();
  };

  const answer = async (approve: boolean) => {
    if (busy) return;
    setBusy(true);
    try {
      await respondCareChangeRequest(request.id, approve, approve ? null : reason, approve ? null : note.trim() || null);
      done(approve ? `Added to ${request.petName}'s tasks ✅` : "Declined — the owner was told");
    } catch (error) {
      errorDialog.show({ title: "Not sent", message: (error as Error).message, onRetry: () => void answer(approve) });
    } finally {
      setBusy(false);
    }
  };

  const counter = async () => {
    if (busy) return;
    const dollars = Number(fee.replace(/[^0-9.]/g, ""));
    const cents = fee.trim() && Number.isFinite(dollars) ? Math.round(dollars * 100) : null;
    setBusy(true);
    try {
      await counterCareChangeRequest(request.id, note.trim(), cents, ownerTasks);
      done("Counter-request sent — the owner will answer");
    } catch (error) {
      errorDialog.show({ title: "Not sent", message: (error as Error).message, onRetry: () => void counter() });
    } finally {
      setBusy(false);
    }
  };

  const hasNote = note.trim().length > 0;
  const toggleOwner = (i: number) => setOwnerTasks((prev) => (prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i]));

  const open = request.status === "pending";

  return (
    <Screen contentStyle={styles.content} testID="sitter-care-request">
      <Stack.Screen options={{ title: `${request.petName} · Care request` }} />
      <Text style={styles.heading}>{`New care request for ${request.petName}`}</Text>
      {!open ? (
        <Text style={styles.muted} testID="request-answered">
          {{
            approved: "✅ You approved this request.",
            declined: "You declined this request.",
            countered: "💬 You sent a counter-request — waiting for the owner.",
            accepted: "✅ The owner accepted your counter-request.",
            withdrawn: "The owner declined your counter-request.",
            closed: "The stay ended before this request was answered.",
            pending: "",
          }[request.status]}
        </Text>
      ) : null}

      {request.tasks.length > 0 ? (
        <Card style={styles.card} testID="request-tasks">
          <Text style={styles.label}>Tasks</Text>
          {request.tasks.map((t, i) => (
            <View key={i} style={styles.row}>
              <Text style={styles.time}>{formatTime(t.time.slice(0, 5))}</Text>
              <View style={styles.rowText}>
                <Text style={styles.title}>{`${careTypeMeta(t.type).emoji} ${t.title}`}</Text>
                <Text style={styles.muted}>
                  {[t.dose, t.repeat === false ? "once" : "every day"].filter(Boolean).join(" · ")}
                </Text>
              </View>
            </View>
          ))}
        </Card>
      ) : null}
      {request.cautions.length > 0 ? (
        <Card style={styles.card} testID="request-cautions">
          <Text style={styles.label}>⚠️ Heads-up</Text>
          {request.cautions.map((c, i) => (
            <Text key={i} style={styles.title}>{`• ${c}`}</Text>
          ))}
        </Card>
      ) : null}

      {open ? (
        <View style={styles.actions}>
          <Button label={busy ? "Working…" : "Approve"} onPress={() => void answer(true)} disabled={busy} testID="request-approve" />
          <Button label="Decline or reply…" variant="secondary" onPress={() => setDeclining(true)} disabled={busy} testID="request-decline" />
        </View>
      ) : null}

      <Sheet visible={declining} title="Reply to this request" onClose={() => setDeclining(false)} testID="decline-sheet">
        <Text style={styles.muted}>Pick a reason and/or leave a note — the owner sees both.</Text>
        <View style={styles.reasons}>
          {DECLINE_REASONS.map((r, i) => (
            <Pressable
              key={r}
              accessibilityRole="radio"
              aria-checked={reason === r}
              onPress={() => setReason(reason === r ? null : r)}
              style={({ pressed }) => [styles.reason, reason === r && styles.reasonOn, pressed && styles.pressed]}
              testID={`decline-reason-${i}`}
            >
              <Text style={[styles.reasonText, reason === r && styles.reasonTextOn]}>{r}</Text>
            </Pressable>
          ))}
        </View>
        <TextField
          label="Note to the owner (optional)"
          value={note}
          multiline
          numberOfLines={3}
          maxLength={NOTE_MAX}
          placeholder="e.g. I can do the meals, but the late walk is hard for me."
          onChangeText={setNote}
          testID="decline-note"
        />

        {hasNote ? (
          <View style={styles.counterBox} testID="counter-box">
            <Text style={styles.label}>Or send a counter-request</Text>
            <TextField
              label="Extra fee, $ (optional)"
              value={fee}
              keyboardType="decimal-pad"
              maxLength={6}
              placeholder="0"
              onChangeText={setFee}
              testID="counter-fee"
            />
            {request.tasks.length > 0 ? <Text style={styles.muted}>Tasks you would like the owner to do themselves:</Text> : null}
            <View style={styles.reasons}>
              {request.tasks.map((t, i) => (
                <Pressable
                  key={i}
                  accessibilityRole="checkbox"
                  aria-checked={ownerTasks.includes(i)}
                  onPress={() => toggleOwner(i)}
                  style={({ pressed }) => [styles.reason, ownerTasks.includes(i) && styles.reasonOn, pressed && styles.pressed]}
                  testID={`counter-owner-${i}`}
                >
                  <Text style={[styles.reasonText, ownerTasks.includes(i) && styles.reasonTextOn]}>
                    {`${ownerTasks.includes(i) ? "✓ " : ""}${formatTime(t.time.slice(0, 5))} ${t.title}`}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Button label={busy ? "Working…" : "Send counter-request"} onPress={() => void counter()} disabled={busy} testID="counter-send" />
          </View>
        ) : null}

        <Button
          label={busy ? "Working…" : "Decline"}
          variant={hasNote ? "secondary" : "primary"}
          onPress={() => void answer(false)}
          disabled={busy || (!reason && !hasNote)}
          testID="decline-confirm"
        />
      </Sheet>
    </Screen>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    content: { gap: theme.spacing.sm },
    heading: { fontSize: theme.fontSize.title, fontWeight: "700", color: theme.color.text },
    card: { gap: theme.spacing.xs },
    label: { fontSize: theme.fontSize.small, fontWeight: "700", color: theme.color.textMuted },
    row: { flexDirection: "row", alignItems: "center", gap: theme.spacing.sm },
    rowText: { flex: 1 },
    time: { width: 76, fontSize: theme.fontSize.body, fontWeight: "700", color: theme.color.text },
    title: { fontSize: theme.fontSize.body, color: theme.color.text },
    muted: { fontSize: theme.fontSize.small, color: theme.color.textMuted },
    reasons: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
    reason: {
      minHeight: 40,
      justifyContent: "center",
      paddingHorizontal: theme.spacing.sm + 2,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: theme.color.primary,
      backgroundColor: theme.color.surface,
    },
    reasonOn: { backgroundColor: theme.color.primary },
    reasonText: { fontSize: theme.fontSize.small, fontWeight: "600", color: theme.color.primary },
    reasonTextOn: { color: theme.color.primaryText },
    pressed: { opacity: 0.7 },
    counterBox: { gap: 6, padding: theme.spacing.sm, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.color.border },
    actions: { gap: theme.spacing.xs, marginTop: theme.spacing.sm },
  });
