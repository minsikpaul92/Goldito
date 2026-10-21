import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Button } from "./ui/Button";
import { ChoiceChips } from "./ui/ChoiceChips";
import { Sheet } from "./ui/Sheet";
import { TextButton } from "./ui/TextButton";
import { TextField } from "./ui/TextField";
import { ChatPet, addQuoteExtra, sendChatQuote } from "../features/chat/chatApi";
import { formatDay, formatTime, isoToZoned } from "../features/schedule/dates";
import { ServiceType, getSitterProfile } from "../features/sitters/sitterApi";
import { PriceQuote, quoteBooking } from "../lib/bookings";
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
  /** The quote after the Meet & Greet and the agreement: the final one. */
  final?: boolean;
  onSent: () => void;
};

const MAX_DRAFT_FEES = 5;
const money = (n: number) => `$${n.toFixed(2)}`;

/**
 * The sitter reviews the quote before it goes out (#235): the server's breakdown from their saved rates (never typed),
 * fees they add as lines, then Send. The fees go with the quote as offers the owner answers one by one.
 */
export function SendQuoteSheet({ visible, onClose, threadId, sitterId, stay, final, onSent }: SendProps) {
  const styles = useThemedStyles(makeStyles);
  const errorDialog = useErrorDialog();
  const [services, setServices] = useState<string[]>(["boarding"]);
  const [service, setService] = useState("boarding");
  const [quote, setQuote] = useState<PriceQuote | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [fees, setFees] = useState<{ label: string; amount: number }[]>([]);
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setFees([]);
    setLabel("");
    setAmount("");
    getSitterProfile(sitterId)
      .then((p) => {
        const list: string[] = p?.services?.length ? p.services : ["boarding"];
        setServices(list);
        setService((s) => (list.includes(s) ? s : list[0]));
      })
      .catch(() => undefined);
  }, [visible, sitterId]);

  const fixed = stay?.service;
  const priced = fixed ?? service;
  const stayKey = stay ? `${stay.dropOffAt}|${stay.pickUpAt}|${stay.pets.length}` : "";
  useEffect(() => {
    if (!visible || !stay) return;
    let current = true;
    setQuote(null);
    setProblem(null);
    quoteBooking({ sitterId, serviceType: priced as ServiceType, dropOffAt: stay.dropOffAt, pickUpAt: stay.pickUpAt, petCount: stay.pets.length })
      .then((q) => current && setQuote(q))
      .catch((e: Error) => current && setProblem(e.message));
    return () => {
      current = false;
    };
    // the draft follows the service and the stay
  }, [visible, sitterId, priced, stayKey]);

  if (!stay) return null;

  const value = Number(amount.replace(",", "."));
  const feeOk = label.trim().length > 0 && Number.isFinite(value) && value > 0 && value <= 500 && fees.length < MAX_DRAFT_FEES;
  const addFee = () => {
    if (!feeOk) return;
    setFees((f) => [...f, { label: label.trim(), amount: Math.round(value * 100) / 100 }]);
    setLabel("");
    setAmount("");
  };

  const send = async () => {
    setSending(true);
    let messageId = "";
    try {
      messageId = await sendChatQuote(threadId, { service: priced, dropOffAt: stay.dropOffAt, pickUpAt: stay.pickUpAt, petIds: stay.pets.map((p) => p.id) });
    } catch (e) {
      errorDialog.show({ title: "Quote not sent", message: (e as Error).message, onRetry: () => void send() });
      setSending(false);
      return;
    }
    try {
      for (const f of fees) await addQuoteExtra(messageId, f.label, f.amount);
    } catch (e) {
      errorDialog.show({ title: "Quote sent, a fee was not added", message: (e as Error).message });
    }
    setSending(false);
    onClose();
    onSent();
  };

  const unit =
    quote && quote.service !== "daycare" && quote.nights > 0
      ? `${quote.nights} night${quote.nights === 1 ? "" : "s"} × ${money(quote.unit_price)}`
      : quote
        ? `${quote.days} day${quote.days === 1 ? "" : "s"} × ${money(quote.unit_price)}`
        : "";
  const row = (name: string, amountText: string, id?: string) => (
    <View style={styles.row} key={name}>
      <Text style={styles.line}>{name}</Text>
      <Text style={styles.line} testID={id}>{amountText}</Text>
    </View>
  );

  return (
    <Sheet
      visible={visible}
      title={final ? "Final quote" : "Quote"}
      onClose={onClose}
      testID="send-quote-sheet"
      footer={
        <Button
          label={final ? "Send final quote" : "Send quote"}
          disabled={sending || !quote}
          onPress={() => void send()}
          testID="send-quote-submit"
        />
      }
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
      {problem ? (
        <Text style={styles.problem} accessibilityRole="alert" testID="send-quote-problem">
          {problem}
        </Text>
      ) : null}
      {quote ? (
        <View style={styles.draft} testID="send-quote-draft">
          {row(unit, money(quote.base))}
          {quote.extra_pets > 0 ? row("Extra pet", money(quote.extra_pets)) : null}
          {quote.holiday_surcharge > 0 ? row("Holiday", money(quote.holiday_surcharge)) : null}
          {fees.map((f, i) => (
            <View style={styles.row} key={`${f.label}-${i}`} testID="draft-fee">
              <Text style={styles.line}>{f.label}</Text>
              <View style={styles.feeEnd}>
                <Text style={styles.line}>{money(f.amount)}</Text>
                <TextButton label="Remove" onPress={() => setFees((list) => list.filter((_, j) => j !== i))} testID="draft-fee-remove" />
              </View>
            </View>
          ))}
          <View style={[styles.row, styles.totalRow]}>
            <Text style={styles.total}>{fees.length > 0 ? "Total with your fees" : "Total"}</Text>
            <Text style={styles.total} testID="draft-total">
              {`${money(quote.total + fees.reduce((n, f) => n + f.amount, 0))} ${quote.currency}`}
            </Text>
          </View>
        </View>
      ) : null}
      {quote && fees.length < MAX_DRAFT_FEES ? (
        <View style={styles.feeForm}>
          <ChoiceChips
            options={FEE_LABELS.map((l) => ({ value: l, label: l }))}
            value={FEE_LABELS.includes(label) ? [label] : []}
            onChange={(v) => setLabel(v[0] ?? "")}
            testID="draft-fee-labels"
          />
          <TextField label="Fee" value={label} onChangeText={setLabel} maxLength={40} testID="draft-fee-label" />
          <TextField label="Amount (CAD)" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" testID="draft-fee-amount" />
          <TextButton label="Add fee" disabled={!feeOk} onPress={addFee} testID="draft-fee-add" />
        </View>
      ) : null}
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
    line: { fontSize: theme.fontSize.body, color: theme.color.text, flexShrink: 1 },
    problem: { fontSize: theme.fontSize.small, color: theme.color.error },
    draft: { gap: theme.spacing.xs },
    row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: theme.spacing.md },
    feeEnd: { flexDirection: "row", alignItems: "center", gap: theme.spacing.sm },
    totalRow: { marginTop: theme.spacing.xs, paddingTop: theme.spacing.sm, borderTopWidth: 1, borderTopColor: theme.color.border },
    total: { fontSize: theme.fontSize.body, fontWeight: theme.fontWeight.bold, color: theme.color.text },
    feeForm: { gap: theme.spacing.xs },
  });
