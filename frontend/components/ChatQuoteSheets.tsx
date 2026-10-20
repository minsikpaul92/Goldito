import { useEffect, useState } from "react";
import { StyleSheet, Text } from "react-native";

import { Button } from "./ui/Button";
import { ChoiceChips } from "./ui/ChoiceChips";
import { Sheet } from "./ui/Sheet";
import { TextField } from "./ui/TextField";
import { ChatPet, addQuoteExtra, sendChatQuote } from "../features/chat/chatApi";
import { formatDay, formatTime, isoToZoned } from "../features/schedule/dates";
import { getSitterProfile } from "../features/sitters/sitterApi";
import { useErrorDialog } from "../providers/ErrorDialogProvider";
import { useThemedStyles } from "../providers/ThemeProvider";
import { Theme } from "../theme/themes";

const SERVICE: Record<string, string> = { boarding: "Boarding", house_sitting: "House sitting", daycare: "Daycare" };
const FEE_LABELS = ["Medication", "Extra walks", "Late pick-up", "Grooming"];

function short(iso: string): string {
  const z = isoToZoned(iso);
  return `${formatDay(z.day)} ${formatTime(z.time)}`;
}

type SendProps = {
  visible: boolean;
  onClose: () => void;
  threadId: string;
  sitterId: string;
  /** `service` set: the booking's own service (the final quote), so the price matches the booking. */
  stay: { dropOffAt: string; pickUpAt: string; pets: ChatPet[]; service?: string } | null;
  onSent: () => void;
};

/** The sitter prices the stay on the chat's latest card with their saved rates; one tap sends the server's number. */
export function SendQuoteSheet({ visible, onClose, threadId, sitterId, stay, onSent }: SendProps) {
  const styles = useThemedStyles(makeStyles);
  const errorDialog = useErrorDialog();
  const [services, setServices] = useState<string[]>(["boarding"]);
  const [service, setService] = useState("boarding");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!visible) return;
    getSitterProfile(sitterId)
      .then((p) => {
        const list: string[] = p?.services?.length ? p.services : ["boarding"];
        setServices(list);
        setService((s) => (list.includes(s) ? s : list[0]));
      })
      .catch(() => undefined);
  }, [visible, sitterId]);

  if (!stay) return null;
  const fixed = stay.service;

  const send = async () => {
    setSending(true);
    try {
      await sendChatQuote(threadId, { service: fixed ?? service, dropOffAt: stay.dropOffAt, pickUpAt: stay.pickUpAt, petIds: stay.pets.map((p) => p.id) });
      onClose();
      onSent();
    } catch (e) {
      errorDialog.show({ title: "Quote not sent", message: (e as Error).message, onRetry: () => void send() });
    } finally {
      setSending(false);
    }
  };

  return (
    <Sheet
      visible={visible}
      title="Send quote"
      onClose={onClose}
      testID="send-quote-sheet"
      footer={<Button label="Send quote" disabled={sending} onPress={() => void send()} testID="send-quote-submit" />}
    >
      {fixed ? (
        <Text style={styles.line} testID="send-quote-fixed-service">{SERVICE[fixed] ?? fixed}</Text>
      ) : services.length > 1 ? (
        <ChoiceChips
          options={services.map((s) => ({ value: s, label: SERVICE[s] ?? s }))}
          value={[service]}
          onChange={(v) => v[0] && setService(v[0])}
          testID="send-quote-service"
        />
      ) : null}
      <Text style={styles.line}>{stay.pets.map((p) => p.name).join(", ")}</Text>
      <Text style={styles.line}>{`${short(stay.dropOffAt)} to ${short(stay.pickUpAt)}`}</Text>
    </Sheet>
  );
}

type FeeProps = { visible: boolean; onClose: () => void; messageId: string | null; onAdded: () => void };

/** An extra fee line on an open quote. The owner accepts or declines it on the card. */
export function AddFeeSheet({ visible, onClose, messageId, onAdded }: FeeProps) {
  const errorDialog = useErrorDialog();
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (visible) {
      setLabel("");
      setAmount("");
    }
  }, [visible]);

  const value = Number(amount.replace(",", "."));
  const ok = label.trim().length > 0 && Number.isFinite(value) && value > 0 && value <= 500;

  const add = async () => {
    if (!messageId || !ok) return;
    setSending(true);
    try {
      await addQuoteExtra(messageId, label.trim(), value);
      onClose();
      onAdded();
    } catch (e) {
      errorDialog.show({ title: "Fee not added", message: (e as Error).message, onRetry: () => void add() });
    } finally {
      setSending(false);
    }
  };

  return (
    <Sheet
      visible={visible}
      title="Add a fee"
      onClose={onClose}
      testID="add-fee-sheet"
      footer={<Button label="Add fee" disabled={!ok || sending} onPress={() => void add()} testID="add-fee-submit" />}
    >
      <ChoiceChips
        options={FEE_LABELS.map((l) => ({ value: l, label: l }))}
        value={FEE_LABELS.includes(label) ? [label] : []}
        onChange={(v) => setLabel(v[0] ?? "")}
        testID="add-fee-labels"
      />
      <TextField label="Label" value={label} onChangeText={setLabel} maxLength={40} testID="add-fee-label" />
      <TextField label="Amount (CAD)" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" testID="add-fee-amount" />
    </Sheet>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    line: { fontSize: theme.fontSize.body, color: theme.color.text },
  });
