import { Stack, router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Button } from "../../../components/ui/Button";
import { Card } from "../../../components/ui/Card";
import { EmptyState } from "../../../components/ui/EmptyState";
import { LoadingView } from "../../../components/ui/LoadingView";
import { Screen } from "../../../components/ui/Screen";
import { Sheet } from "../../../components/ui/Sheet";
import { careTypeMeta } from "../../../features/care/careFormat";
import { ChangeRequest, getChangeRequest, respondCareChangeRequest } from "../../../features/care/carePlanApi";
import { formatTime } from "../../../features/schedule/dates";
import { useErrorDialog } from "../../../providers/ErrorDialogProvider";
import { useThemedStyles } from "../../../providers/ThemeProvider";
import { useToast } from "../../../providers/ToastProvider";
import { Theme } from "../../../theme/themes";

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

  const answer = async (approve: boolean) => {
    if (busy) return;
    setBusy(true);
    try {
      await respondCareChangeRequest(request.id, approve, approve ? null : reason);
      toast.show(approve ? `Added to ${request.petName}'s tasks ✅` : "Declined — the owner was told");
      setDeclining(false);
      router.back();
    } catch (error) {
      errorDialog.show({ title: "Not sent", message: (error as Error).message, onRetry: () => void answer(approve) });
    } finally {
      setBusy(false);
    }
  };

  const open = request.status === "pending";

  return (
    <Screen contentStyle={styles.content} testID="sitter-care-request">
      <Stack.Screen options={{ title: `${request.petName} · Care request` }} />
      <Text style={styles.heading}>{`New care request for ${request.petName}`}</Text>
      {!open ? (
        <Text style={styles.muted} testID="request-answered">
          {request.status === "approved" ? "✅ You approved this request." : "You declined this request."}
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
          <Button label="Decline" variant="secondary" onPress={() => setDeclining(true)} disabled={busy} testID="request-decline" />
        </View>
      ) : null}

      <Sheet visible={declining} title="Decline this request" onClose={() => setDeclining(false)} testID="decline-sheet">
        <Text style={styles.muted}>Pick a reason — the owner sees it and can message you to adjust.</Text>
        {DECLINE_REASONS.map((r) => (
          <Button
            key={r}
            label={reason === r ? `✓ ${r}` : r}
            variant="secondary"
            onPress={() => setReason(r)}
            testID={`decline-reason-${DECLINE_REASONS.indexOf(r)}`}
          />
        ))}
        <Button label={busy ? "Working…" : "Decline"} onPress={() => void answer(false)} disabled={busy || !reason} testID="decline-confirm" />
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
    actions: { gap: theme.spacing.xs, marginTop: theme.spacing.sm },
  });
