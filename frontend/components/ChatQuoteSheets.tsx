import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Button } from "./ui/Button";
import { ChoiceChips } from "./ui/ChoiceChips";
import { Sheet } from "./ui/Sheet";
import { ChatPet, sendChatQuote } from "../features/chat/chatApi";
import { formatDay, formatTime, isoToZoned } from "../features/schedule/dates";
import { ServiceType, getSitterProfile } from "../features/sitters/sitterApi";
import { PriceQuote, quoteBooking } from "../lib/bookings";
import { useErrorDialog } from "../providers/ErrorDialogProvider";
import { useThemedStyles } from "../providers/ThemeProvider";
import { Theme } from "../theme/themes";

const SERVICE: Record<string, string> = { boarding: "Boarding", house_sitting: "House sitting", daycare: "Daycare" };

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

const money = (n: number) => `$${n.toFixed(2)}`;

/**
 * The sitter reviews the quote before it goes out (#235): the server's breakdown from their saved rates (never typed),
 * then Send. One all-inclusive price, no extra fees (#265).
 */
export function SendQuoteSheet({ visible, onClose, threadId, sitterId, stay, final, onSent }: SendProps) {
  const styles = useThemedStyles(makeStyles);
  const errorDialog = useErrorDialog();
  const [services, setServices] = useState<string[]>(["boarding"]);
  const [service, setService] = useState("boarding");
  const [quote, setQuote] = useState<PriceQuote | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
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

  const send = async () => {
    setSending(true);
    try {
      await sendChatQuote(threadId, { service: priced, dropOffAt: stay.dropOffAt, pickUpAt: stay.pickUpAt, petIds: stay.pets.map((p) => p.id) });
    } catch (e) {
      errorDialog.show({ title: "Quote not sent", message: (e as Error).message, onRetry: () => void send() });
      setSending(false);
      return;
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
          <View style={[styles.row, styles.totalRow]}>
            <Text style={styles.total}>Total</Text>
            <Text style={styles.total} testID="draft-total">
              {`${money(quote.total)} ${quote.currency}`}
            </Text>
          </View>
        </View>
      ) : null}
    </Sheet>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    line: { fontSize: theme.fontSize.body, color: theme.color.text, flexShrink: 1 },
    problem: { fontSize: theme.fontSize.small, color: theme.color.error },
    draft: { gap: theme.spacing.xs },
    row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: theme.spacing.md },
    totalRow: { marginTop: theme.spacing.xs, paddingTop: theme.spacing.sm, borderTopWidth: 1, borderTopColor: theme.color.border },
    total: { fontSize: theme.fontSize.body, fontWeight: theme.fontWeight.bold, color: theme.color.text },
  });
