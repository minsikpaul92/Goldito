import { Stack, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { MessageBubble } from "../../../components/MessageBubble";
import { QuoteCard } from "../../../components/QuoteCard";
import { Button } from "../../../components/ui/Button";
import { Card } from "../../../components/ui/Card";
import { Chip } from "../../../components/ui/Chip";
import { EmptyState } from "../../../components/ui/EmptyState";
import { LoadingView } from "../../../components/ui/LoadingView";
import { Screen } from "../../../components/ui/Screen";
import { TextButton } from "../../../components/ui/TextButton";
import { TextField } from "../../../components/ui/TextField";
import {
  InquiryView,
  ReplyIntent,
  getInquiry,
  markInquiryRead,
  recordReplySample,
  regenerateDraft,
  sendInquiryReply,
  tripSummary,
} from "../../../features/inquiries/inquiryApi";
import { formatTime, isoToZoned } from "../../../features/schedule/dates";
import { useErrorDialog } from "../../../providers/ErrorDialogProvider";
import { useThemedStyles } from "../../../providers/ThemeProvider";
import { useToast } from "../../../providers/ToastProvider";
import { Theme } from "../../../theme/themes";

const POLL_MS = 3000;
const INTENTS: { value: ReplyIntent; label: string }[] = [
  { value: "accept", label: "Accept" },
  { value: "decline", label: "Decline" },
  { value: "suggest_dates", label: "Suggest other dates" },
];

/**
 * The sitter's side of one inquiry (phase-07B 7B.6): the owner's question, the draft in the sitter's own voice with
 * the warning line, and one tap to **Send** it as is — or Edit / Add, Regenerate, or lean it with an intent chip.
 * Nothing reaches the owner until Send (D36 · D38).
 */
export default function SitterInquiry() {
  const styles = useThemedStyles(makeStyles);
  const toast = useToast();
  const errorDialog = useErrorDialog();
  const { inquiryId } = useLocalSearchParams<{ inquiryId: string }>();
  const [inquiry, setInquiry] = useState<InquiryView | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState<"send" | "regenerate" | null>(null);

  const load = useCallback(async () => {
    try {
      setInquiry(await getInquiry(inquiryId));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [inquiryId]);

  useEffect(() => {
    void load();
    void markInquiryRead(inquiryId); // opening the thread is the only "read" the owner ever sees
  }, [load, inquiryId]);

  const replied = !!inquiry?.messages.some((m) => m.author === "sitter");
  const draft = inquiry?.draft ?? null;
  // Waiting for the draft: a slow poll until it arrives.
  useEffect(() => {
    if (!inquiry || draft || replied) return;
    const timer = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(timer);
  }, [inquiry, draft, replied, load]);

  // A fresh draft replaces whatever was being edited.
  useEffect(() => {
    if (draft) {
      setText(draft.body);
      setEditing(false);
    }
  }, [draft?.id]);

  if (error && inquiry === undefined) {
    return (
      <Screen>
        <EmptyState emoji="💬" title="Couldn't load this question" message={error} action={{ label: "Try again", onPress: () => void load() }} />
      </Screen>
    );
  }
  if (inquiry === undefined) return <LoadingView />;
  if (inquiry === null) {
    return (
      <Screen>
        <EmptyState emoji="💬" title="Question not found" message="This question isn't available." />
      </Screen>
    );
  }

  const when = (at: string) => `${isoToZoned(at).day.slice(5)} ${formatTime(isoToZoned(at).time)}`;
  const question = inquiry.messages.filter((m) => m.author === "owner").at(-1);

  const send = async () => {
    if (busy || !text.trim()) return;
    setBusy("send");
    try {
      await sendInquiryReply(inquiry.id, text.trim(), draft?.id ?? null);
      void recordReplySample(inquiry.id);
      toast.show(`Sent ✅ ${inquiry.ownerName} was told`);
      await load();
    } catch (e) {
      errorDialog.show({ title: "Not sent", message: (e as Error).message, onRetry: () => void send() });
    } finally {
      setBusy(null);
    }
  };

  const regenerate = async (intent?: ReplyIntent) => {
    if (busy) return;
    setBusy("regenerate");
    try {
      await regenerateDraft(inquiry.id, intent);
      await load();
    } catch (e) {
      errorDialog.show({ title: "No new draft", message: (e as Error).message });
    } finally {
      setBusy(null);
    }
  };

  return (
    <Screen testID="sitter-inquiry" contentStyle={styles.content}>
      <Stack.Screen options={{ title: inquiry.ownerName }} />
      <Card style={styles.trip}>
        <Text style={styles.tripTitle} testID="inquiry-trip">
          {tripSummary(inquiry.serviceType, inquiry.dropOffAt, inquiry.pickUpAt, inquiry.petNames)}
        </Text>
        <Text style={styles.muted}>{`Drop-off ${when(inquiry.dropOffAt)} · Pick-up ${when(inquiry.pickUpAt)}`}</Text>
      </Card>

      {inquiry.messages.map((m) => (
        <MessageBubble
          key={m.id}
          side={m.author === "sitter" ? "me" : "them"}
          body={m.body}
          meta={m.auto ? `${when(m.at)} · Sent automatically` : when(m.at)}
          testID={`inquiry-message-${m.author}`}
        />
      ))}

      {replied ? (
        <Text style={styles.muted} testID="inquiry-replied">{`You replied. ${inquiry.ownerName} was told.`}</Text>
      ) : draft || editing ? (
        <Card style={styles.draft} testID="inquiry-draft">
          <Text style={styles.warning} testID="inquiry-warning">
            AI drafts can be wrong. You're responsible for what you send.
          </Text>
          {draft?.needsSitter ? (
            <Text style={styles.check} testID="inquiry-needs-you">
              ⚠️ Check this one — something needs your confirmation.
            </Text>
          ) : null}
          {editing ? (
            <TextField label="Your reply" value={text} multiline maxLength={2000} onChangeText={setText} testID="inquiry-edit" />
          ) : (
            <Text style={styles.body} testID="inquiry-draft-body">
              {draft?.body}
            </Text>
          )}
          {draft?.quote && draft.canHost !== false ? <QuoteCard quote={draft.quote} compact testID="inquiry-draft-quote" /> : null}
          {draft && draft.sources.length > 0 ? (
            <View style={styles.sources} testID="inquiry-draft-sources">
              {[...new Set(draft.sources.map((s) => s.label))].map((label) => (
                <Chip key={label} label={label} />
              ))}
            </View>
          ) : null}
          <Button
            label={busy === "send" ? "Sending…" : "Send"}
            disabled={busy != null || !text.trim()}
            onPress={() => void send()}
            testID="inquiry-send"
          />
          <View style={styles.row}>
            <TextButton
              label={editing ? "Use the draft text" : "Edit / Add"}
              onPress={() => {
                if (editing && draft) setText(draft.body);
                setEditing(!editing);
              }}
              testID="inquiry-edit-toggle"
            />
            <TextButton
              label={busy === "regenerate" ? "Writing…" : "Regenerate"}
              disabled={busy != null}
              onPress={() => void regenerate()}
              testID="inquiry-regenerate"
            />
          </View>
          <Text style={styles.label}>Lean the draft</Text>
          <View style={styles.row}>
            {INTENTS.map((i) => (
              <Button
                key={i.value}
                label={i.label}
                variant="secondary"
                disabled={busy != null}
                onPress={() => void regenerate(i.value)}
                testID={`inquiry-intent-${i.value}`}
              />
            ))}
          </View>
        </Card>
      ) : (
        <Card style={styles.draft} testID="inquiry-no-draft">
          <Text style={styles.muted}>{question ? "Your draft is being written…" : "Waiting for the question."}</Text>
          <TextButton label="Write it myself" onPress={() => setEditing(true)} testID="inquiry-write-myself" />
        </Card>
      )}
    </Screen>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    content: { gap: theme.spacing.md },
    trip: { gap: theme.spacing.xs },
    tripTitle: { fontSize: theme.fontSize.body, fontWeight: "700", color: theme.color.text },
    muted: { fontSize: theme.fontSize.small, color: theme.color.textMuted },
    draft: { gap: theme.spacing.sm },
    warning: { fontSize: theme.fontSize.small, fontWeight: "600", color: theme.color.textMuted },
    check: { fontSize: theme.fontSize.small, fontWeight: "700", color: theme.color.warning },
    body: { fontSize: theme.fontSize.body, color: theme.color.text },
    label: { fontSize: theme.fontSize.small, fontWeight: "600", color: theme.color.textMuted },
    row: { flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.xs, alignItems: "center" },
    sources: { flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.xs },
  });
