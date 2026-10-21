import { useState } from "react";
import { StyleSheet, Text } from "react-native";

import { Button } from "./ui/Button";
import { Sheet } from "./ui/Sheet";
import { TextField } from "./ui/TextField";
import { sendChatMessage } from "../features/chat/chatApi";
import { useThemedStyles } from "../providers/ThemeProvider";
import { useToast } from "../providers/ToastProvider";
import { Theme } from "../theme/themes";

type Props = {
  visible: boolean;
  threadId: string;
  /** The sitter, for the title and the toast. */
  sitterName: string;
  /** What the final quote asks for (price plus fees not declined), prefilled so the owner edits a number they can see. */
  total: number;
  onClose: () => void;
  onSent: () => void;
};

const money = (n: number) => `$${n.toFixed(2)}`;

/** "250", "250.5", "$250.00" → 250.5; anything else → null. */
function parseAmount(text: string): number | null {
  const clean = text.trim().replace(/^\$/, "").replace(/,/g, "");
  if (!/^\d{1,5}(\.\d{1,2})?$/.test(clean)) return null;
  const n = Number(clean);
  return n > 0 ? n : null;
}

/**
 * "Suggest another price" on a final quote whose total changed since the first quote (#230 part 3). The owner's
 * number is only a message to the sitter: the price stays what the server computes, and the sitter answers by
 * sending a new final quote (fees changed), which replaces this one.
 */
export function ChatCounterSheet({ visible, threadId, sitterName, total, onClose, onSent }: Props) {
  const styles = useThemedStyles(makeStyles);
  const toast = useToast();
  const [amount, setAmount] = useState(total.toFixed(2));
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const value = parseAmount(amount);
  const problem = value == null ? "Enter an amount, like 250.00." : value === total ? "That is the price already." : null;

  const send = async () => {
    if (value == null || problem) return;
    setBusy(true);
    setError(null);
    try {
      const line = `Could you do ${money(value)} in total?`;
      await sendChatMessage(threadId, note.trim() ? `${line}\n${note.trim()}` : line);
      toast.show(`Sent to ${sitterName}`);
      onSent();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      visible={visible}
      title="Suggest another price"
      onClose={() => (busy ? undefined : onClose())}
      testID="chat-counter-sheet"
      footer={
        <Button
          label={busy ? "Sending…" : `Send to ${sitterName}`}
          disabled={busy || !!problem}
          onPress={() => void send()}
          testID="chat-counter-send"
        />
      }
    >
      <Text style={styles.body}>{`${sitterName} can send a new final quote.`}</Text>
      <TextField
        label="Total you suggest (CAD)"
        value={amount}
        onChangeText={setAmount}
        keyboardType="decimal-pad"
        maxLength={9}
        testID="chat-counter-amount"
      />
      <TextField
        label={`Note to ${sitterName} (optional)`}
        value={note}
        multiline
        numberOfLines={2}
        maxLength={200}
        onChangeText={setNote}
        testID="chat-counter-note"
      />
      {problem && amount.trim() !== "" ? <Text style={styles.problem}>{problem}</Text> : null}
      {error ? (
        <Text accessibilityRole="alert" style={styles.problem} testID="chat-counter-error">
          {error}
        </Text>
      ) : null}
    </Sheet>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    body: { fontSize: theme.fontSize.body, color: theme.color.text },
    problem: { fontSize: theme.fontSize.small, color: theme.color.error },
  });
