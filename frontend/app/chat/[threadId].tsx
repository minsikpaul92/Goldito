import Ionicons from "@expo/vector-icons/Ionicons";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { AgreeSheet } from "../../components/AgreeSheet";
import { BookingStageBar, hasStageBar, stageCaption } from "../../components/BookingStageBar";
import { ChatAgreementCard, ChatPaymentCard } from "../../components/ChatBookingCards";
import { ChatCareCards } from "../../components/ChatCareCards";
import { ChatHandoffCard } from "../../components/ChatHandoffCard";
import { ChatPlusMenu, PlusItem } from "../../components/ChatPlusMenu";
import { ChatQuoteCard } from "../../components/ChatQuoteCard";
import { ChatTripCard } from "../../components/ChatTripCard";
import { AddFeeSheet, SendQuoteSheet } from "../../components/ChatQuoteSheets";
import { ChatHeaderTitle, HeaderStay } from "../../components/ChatHeaderTitle";
import { MeetGreetCard, MeetGreetHandle } from "../../components/MeetGreetCard";
import { MessageBubble } from "../../components/MessageBubble";
import { PhotoViewerSheet } from "../../components/PhotoViewerSheet";
import { RequestBookingSheet } from "../../components/RequestBookingSheet";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { EmptyState } from "../../components/ui/EmptyState";
import { LoadingView } from "../../components/ui/LoadingView";
import { Screen } from "../../components/ui/Screen";
import { TextButton } from "../../components/ui/TextButton";
import {
  ChatCard,
  ChatHeader,
  ChatMessage,
  answerQuoteExtra,
  confirmQuote,
  getChatHeader,
  loadChatMessages,
  markChatRead,
  sendChatMessage,
} from "../../features/chat/chatApi";
import { ChatAction, ChatChip, chipsFor, fetchChatDraft } from "../../features/chat/chatAi";
import { Primary, actionPossible, finalQuote, hasPaymentCard, nextStep } from "../../features/chat/nextStep";
import { inCare } from "../../features/chat/careCards";
import { canStartTripNow } from "../../features/transit/tripLogic";
import { meetGreetPrimary } from "../../lib/meetGreet";
import { useLiveChat } from "../../features/chat/useLiveChat";
import { useMyPets } from "../../features/pets/useMyPets";
import { ProfilePhoto, loadProfilePhotos } from "../../features/profile/profilePhotosApi";
import { formatDay, formatStamp, formatTime, isoToZoned } from "../../features/schedule/dates";
import { SERVICE_LABEL } from "../../features/sitters/sitterApi";
import { BookingSummary, expressInterest, listOwnerBookings, listSitterBookings, respondBooking } from "../../lib/bookings";
import { useErrorDialog } from "../../providers/ErrorDialogProvider";
import { useSession } from "../../providers/SessionProvider";
import { useTheme, useThemedStyles } from "../../providers/ThemeProvider";
import { Theme } from "../../theme/themes";

type Loaded = {
  header: ChatHeader;
  messages: ChatMessage[];
  /** The pair's newest booking that still has a progress bar; the cards of older ones read their own booking. */
  booking: BookingSummary | null;
  pairBookings: BookingSummary[];
};
type StayCard = Extract<ChatCard, { type: "stay" }>;
type RequestCard = Extract<ChatCard, { type: "request" }>;
type QuoteCard = Extract<ChatCard, { type: "quote" }>;

// The message box grows with its text up to about six lines, then it stays that tall and scrolls.
const INPUT_MIN = 44;
const INPUT_MAX = 150;
const INPUT_PAD = 11;

/** "Oct 20 9:00 AM" for one handoff. */
function short(iso: string): string {
  const z = isoToZoned(iso);
  return `${formatDay(z.day)} ${formatTime(z.time)}`;
}

/**
 * One chat per owner and sitter (3D.4): the person and the stay pinned in the header, the booking progress, then
 * everyone's messages and cards, and one thin line to write on. Request booking opens a sheet over the chat.
 */
export default function Chat() {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { threadId } = useLocalSearchParams<{ threadId: string }>();
  const { profile } = useSession();
  const { pets } = useMyPets();
  const errorDialog = useErrorDialog();
  const scroller = useRef<ScrollView>(null);
  const lastCount = useRef(0);
  const [loaded, setLoaded] = useState<Loaded | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [photos, setPhotos] = useState<ProfilePhoto[]>([]);
  const [viewing, setViewing] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [quoting, setQuoting] = useState<"first" | "final" | null>(null);
  const [agreeing, setAgreeing] = useState(false);
  const [plusOpen, setPlusOpen] = useState(false);
  const [signals, setSignals] = useState({ handoff: 0, trip: 0, photo: 0 });
  const [stepBusy, setStepBusy] = useState(false);
  const meetCard = useRef<MeetGreetHandle>(null);
  const [feeFor, setFeeFor] = useState<string | null>(null);
  const [quoteBusy, setQuoteBusy] = useState(false);
  const [chips, setChips] = useState<ChatChip[]>([]);
  const [action, setAction] = useState<ChatAction | null>(null);
  const [drafting, setDrafting] = useState(false);
  const input = useRef<TextInput>(null);
  const [inputHeight, setInputHeight] = useState(INPUT_MIN);

  // On the web the box is a textarea: it is as tall as its text (measured on the element), up to INPUT_MAX, then it scrolls.
  useEffect(() => {
    if (Platform.OS !== "web") return;
    const el = input.current as unknown as HTMLTextAreaElement | null;
    if (!el?.style) return;
    el.style.height = "auto";
    const borders = el.offsetHeight - el.clientHeight; // scrollHeight leaves the border out
    el.style.height = `${Math.min(INPUT_MAX, Math.max(INPUT_MIN, el.scrollHeight + borders))}px`;
  }, [text]);

  const load = useCallback(async () => {
    if (!profile) return;
    try {
      const header = await getChatHeader(threadId);
      if (!header) {
        setLoaded(null);
        return;
      }
      const [messages, bookings] = await Promise.all([
        loadChatMessages(threadId),
        (header.myRole === "owner" ? listOwnerBookings(profile.id) : listSitterBookings(profile.id)).catch(() => [] as BookingSummary[]),
      ]);
      const pairBookings = bookings.filter((b) => b.ownerId === header.ownerId && b.sitterId === header.sitterId);
      // The newest booking of this pair that still has a progress bar.
      const booking = pairBookings.find(hasStageBar) ?? null;
      setLoaded({ header, messages, booking, pairBookings });
      setError(null);
      void markChatRead(threadId);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [threadId, profile]);

  useEffect(() => {
    void load();
  }, [load]);
  useLiveChat(threadId, load);

  const otherId = loaded?.header.otherId;
  useEffect(() => {
    if (!otherId) return;
    loadProfilePhotos(otherId)
      .then(setPhotos)
      .catch(() => setPhotos([]));
  }, [otherId]);

  // Chips are always there: replies to what the other person wrote, or follow-ups after my own message (or openers in an
  // empty chat). The slot is there from the start with a spinner, so nothing jumps when they arrive; the list may have
  // asked ahead, then they are ready at once.
  const all = loaded?.messages;
  const latestAt = all?.at(-1)?.at ?? "none";
  const key = loaded ? `${threadId}:${latestAt}` : null;
  const [chipsReady, setChipsReady] = useState(false);
  useEffect(() => {
    setChips([]);
    setAction(null);
    setChipsReady(false);
    if (!key) return;
    let current = true;
    void chipsFor(threadId, latestAt).then((r) => {
      if (!current) return;
      setChips(r?.chips ?? []);
      setAction(r?.action ?? null);
      setChipsReady(true);
    });
    return () => {
      current = false;
    };
    // the chips belong to the latest message: a new one asks again
  }, [key, threadId, latestAt]);

  /** A tapped chip becomes a draft in the box; nothing is sent until the person presses Send (D62). */
  const pickChip = async (chip: ChatChip) => {
    setDrafting(true);
    const draft = await fetchChatDraft(threadId, chip.label);
    setDrafting(false);
    if (draft) {
      setText(draft);
      setChips([]);
      input.current?.focus();
    }
  };

  // Open at the latest message, and follow new ones.
  const count = loaded?.messages.length ?? 0;
  useEffect(() => {
    if (count !== lastCount.current) {
      lastCount.current = count;
      setTimeout(() => scroller.current?.scrollToEnd({ animated: false }), 50);
    }
  }, [count]);

  if (error && loaded === undefined) {
    return (
      <Screen>
        <EmptyState emoji="💬" title="Couldn't load this chat" message={error} action={{ label: "Try again", onPress: () => void load() }} />
      </Screen>
    );
  }
  if (loaded === undefined) return <LoadingView />;
  if (loaded === null) {
    return (
      <Screen>
        <EmptyState emoji="💬" title="Chat not found" message="This chat isn't available." />
      </Screen>
    );
  }

  const { header, messages, booking, pairBookings } = loaded;
  const me = profile?.id;
  const owner = header.myRole === "owner";

  // The stay in the header is the latest one asked about or requested.
  const latest = [...messages].reverse().find((m) => m.card?.type === "stay" || m.card?.type === "request")?.card as StayCard | RequestCard | undefined;
  const stay: StayCard | null = latest ? { type: "stay", dropOffAt: latest.dropOffAt, pickUpAt: latest.pickUpAt, pets: latest.pets } : null;
  const headerStay: HeaderStay | null = stay ? { ...stay, pets: stay.pets.map((p) => ({ ...p, species: pets.find((x) => x.id === p.id)?.species })) } : null;
  // The sitter's next step: price the stay on the latest card, unless an open or confirmed quote already does.
  const priced = messages.some(
    (m) =>
      m.card?.type === "quote" &&
      m.card.status !== "replaced" &&
      !!stay &&
      Date.parse(m.card.dropOffAt) === Date.parse(stay.dropOffAt) &&
      Date.parse(m.card.pickUpAt) === Date.parse(stay.pickUpAt),
  );
  const step = nextStep({
    role: header.myRole,
    booking,
    messages,
    hasStay: !!stay,
    priced,
    otherName: header.otherName,
  });
  // The final quote prices the booking as it stands now (agreed times and pets), not the first card.
  const finalStay =
    booking?.dropOff && booking.pickUp
      ? {
          dropOffAt: booking.dropOff.at,
          pickUpAt: booking.pickUp.at,
          pets: booking.pets.flatMap((p) => (p.id ? [{ id: p.id, name: p.name }] : [])),
        }
      : null;

  // A quote sent after a booking's payment card is that booking's final quote.
  const payAt = messages.findIndex((m) => m.card?.type === "payment");
  const isFinal = (id: string) => payAt >= 0 && messages.findIndex((m) => m.id === id) > payAt;

  /** One owner action on a quote card; the cards come back from the server. */
  const quoteAction = async (run: () => Promise<void>) => {
    setQuoteBusy(true);
    try {
      await run();
      await load();
    } catch (e) {
      errorDialog.show({ title: "Not saved", message: (e as Error).message });
    } finally {
      setQuoteBusy(false);
    }
  };

  /** The footer's one action. The cards show the result; the screen reloads from the database. */
  const doPrimary = async (p: Primary) => {
    if (p.kind === "request") return setRequesting(true);
    if (p.kind === "agree") return setAgreeing(true);
    if (p.kind === "final_quote") return setQuoting("final");
    if (p.kind === "pay") return booking ? router.push(`/owner/bookings/${booking.id}/checkout` as never) : undefined;
    if (p.kind === "meet") return meetCard.current?.primary();
    if (!booking) return undefined;
    setStepBusy(true);
    try {
      if (p.kind === "interest") await expressInterest(booking.id);
      else if (p.kind === "accept") await respondBooking(booking.id, true);
      else if (p.kind === "confirm_quote") await confirmQuote(p.messageId);
      await load();
    } catch (e) {
      errorDialog.show({ title: "Not saved", message: (e as Error).message });
    } finally {
      setStepBusy(false);
    }
    return undefined;
  };

  /** An action chip: the same thing the footer or the card would do. Shown only while it is possible (actionPossible). */
  const doAction = async (a: ChatAction) => {
    setAction(null);
    if (a.id === "send_quote") return setQuoting("first");
    if (a.id === "meet_time" || a.id === "meet_accept") return meetCard.current?.primary();
    if (a.id === "meet_skip") return meetCard.current?.skip();
    return step.primary ? doPrimary(step.primary) : undefined;
  };
  const shownAction = action && actionPossible(action.id, step, booking, header.myRole) ? action : null;

  // The + menu (#235): each entry opens what the flow opens. Entries that cannot work right now are dimmed.
  const bump = (key: "handoff" | "trip" | "photo") => setSignals((n) => ({ ...n, [key]: n[key] + 1 }));
  const quoteKind = booking && hasPaymentCard(messages, booking.id) ? "final" : "first";
  const plusItems: PlusItem[] = [
    {
      id: "meet",
      label: "Meet & Greet request",
      icon: "people-outline",
      enabled: !!booking && !!meetGreetPrimary(booking, header.myRole) && !!meetCard.current,
      onPress: () => meetCard.current?.primary(),
    },
    ...(!owner
      ? [
          {
            id: "quote",
            label: quoteKind === "final" ? "Final quote" : "Quote",
            icon: "pricetag-outline" as const,
            enabled: quoteKind === "final" ? !!finalStay : !!stay,
            onPress: () => setQuoting(quoteKind),
          },
        ]
      : []),
    {
      id: "date",
      label: "Date change",
      icon: "calendar-outline",
      enabled: !!booking && ["requested", "confirmed"].includes(booking.status) && !(booking.dropOff?.completedAt && booking.pickUp?.completedAt),
      onPress: () => bump("handoff"),
    },
    {
      id: "trip",
      label: "Start trip",
      icon: "car-outline",
      enabled: !!booking && canStartTripNow(booking, header.myRole),
      onPress: () => bump("trip"),
    },
    ...(owner
      ? [
          {
            id: "photo",
            label: "Photo request",
            icon: "camera-outline" as const,
            enabled: !!booking && inCare(booking),
            onPress: () => bump("photo"),
          },
        ]
      : []),
  ];

  const send = async () => {
    const body = text.trim();
    if (sending || !body) return;
    setSending(true);
    try {
      await sendChatMessage(threadId, body);
      setText("");
      await load();
    } catch (e) {
      errorDialog.show({ title: "Not sent", message: (e as Error).message, onRetry: () => void send() });
    } finally {
      setSending(false);
    }
  };

  const placeText = (place: RequestCard["dropOffPlace"], sitter: string): string =>
    place.type === "sitter_home" ? `At ${sitter}'s place` : place.type === "owner_home" ? "At the owner's place" : `Elsewhere${place.note ? `: ${place.note}` : ""}`;

  const requestCard = (m: ChatMessage, c: RequestCard) => {
    const mine = m.senderId === me;
    const live = booking && booking.id === c.bookingId ? stageCaption(booking, header.myRole) : null;
    return (
      <View key={m.id} style={[styles.cardRow, mine ? styles.cardMine : styles.cardTheirs]}>
      <Card style={styles.request} testID="chat-request-card">
        <Text style={styles.requestTitle}>{mine ? "You sent a booking request" : "Booking request"}</Text>
        <Text style={styles.requestLine}>{`${SERVICE_LABEL[c.serviceType].replace(/^\S+\s/, "")} · ${c.pets.map((p) => p.name).join(", ")}`}</Text>
        <Text style={styles.requestLine}>{`Drop-off ${short(c.dropOffAt)} · ${placeText(c.dropOffPlace, mine ? header.otherName : (profile?.displayName ?? "the sitter"))}`}</Text>
        <Text style={styles.requestLine}>{`Pick-up ${short(c.pickUpAt)} · ${placeText(c.pickUpPlace, mine ? header.otherName : (profile?.displayName ?? "the sitter"))}`}</Text>
        {c.note ? <Text style={styles.requestNote} testID="chat-request-note">{`“${c.note}”`}</Text> : null}
        {live ? <Text style={styles.requestLive}>{live}</Text> : null}
      </Card>
      </View>
    );
  };

  const bookingPath = booking ? `/${header.myRole}/bookings/${booking.id}` : null;

  /** Meet & Greet, agreement and payment cards hold only a booking id: they draw that booking as it is now. */
  const stepCard = (m: ChatMessage, c: Extract<ChatCard, { type: "meet_greet" | "agreement" | "payment" }>): ReactNode => {
    const b = pairBookings.find((x) => x.id === c.bookingId);
    if (!b) return null;
    const current = booking?.id === b.id;
    const final = finalQuote(messages, b.id);
    const total = b.paidAt ? (b.priceSnapshot?.total ?? null) : final?.card.status === "confirmed" ? final.card.total : null;
    return (
      <View key={m.id} style={styles.cardWide}>
        {c.type === "meet_greet" ? (
          <MeetGreetCard ref={current ? meetCard : undefined} booking={b} viewer={header.myRole} onChanged={load} hidePrimary />
        ) : c.type === "agreement" ? (
          <ChatAgreementCard booking={b} />
        ) : (
          <ChatPaymentCard
            booking={b}
            viewer={header.myRole}
            total={total}
            canPay={owner && current && step.primary?.kind === "pay"}
            onPay={() => router.push(`/owner/bookings/${b.id}/checkout` as never)}
          />
        )}
      </View>
    );
  };

  return (
    <View style={styles.root} testID="chat">
      <Stack.Screen
        options={{
          title: header.otherName,
          headerTitle: () => (
            <ChatHeaderTitle
              name={header.otherName}
              cover={photos[0] ?? null}
              stay={headerStay}
              onAvatar={photos.length > 0 ? () => setViewing(true) : undefined}
              onName={owner ? () => router.push(`/owner/sitters/${header.otherId}`) : undefined}
            />
          ),
        }}
      />
      <View style={styles.stage}>
        {bookingPath ? (
          <Pressable accessibilityRole="button" onPress={() => router.push(bookingPath as never)} testID="chat-stage">
            <BookingStageBar booking={booking} viewer={header.myRole} chat />
          </Pressable>
        ) : (
          <BookingStageBar booking={null} viewer={header.myRole} chat />
        )}
      </View>
      <Screen ref={scroller} contentStyle={styles.content} testID="chat-scroll">
        {messages.length === 0 ? (
          <Text style={styles.hint} testID="chat-empty">{`Say hi to ${header.otherName}.`}</Text>
        ) : null}
        {messages.map((m) =>
          m.kind === "card" && m.card?.type === "stay" ? (
            <View key={m.id} style={[styles.cardRow, m.senderId === me ? styles.cardMine : styles.cardTheirs]}>
              <Card style={styles.stay} testID="chat-stay-card">
                <Text style={styles.requestTitle}>Stay</Text>
                <Text style={styles.requestLine}>{`Drop-off ${short(m.card.dropOffAt)}`}</Text>
                <Text style={styles.requestLine}>{`Pick-up ${short(m.card.pickUpAt)}`}</Text>
                <Text style={styles.requestLine}>{m.card.pets.map((p) => p.name).join(", ")}</Text>
              </Card>
            </View>
          ) : m.kind === "card" && m.card?.type === "request" ? (
            requestCard(m, m.card)
          ) : m.kind === "card" && (m.card?.type === "meet_greet" || m.card?.type === "agreement" || m.card?.type === "payment") ? (
            stepCard(m, m.card)
          ) : m.kind === "card" && m.card?.type === "quote" ? (
            <View key={m.id} style={[styles.cardRow, m.senderId === me ? styles.cardMine : styles.cardTheirs]}>
              <ChatQuoteCard
                card={m.card as QuoteCard}
                role={header.myRole}
                final={isFinal(m.id)}
                busy={quoteBusy}
                onAddFee={() => setFeeFor(m.id)}
                onAnswer={(extraId, accept) => void quoteAction(() => answerQuoteExtra(m.id, extraId, accept))}
                onConfirm={() => void quoteAction(() => confirmQuote(m.id))}
              />
            </View>
          ) : m.kind === "text" ? (
            <MessageBubble
              key={m.id}
              side={m.senderId === me ? "me" : "them"}
              body={m.body ?? ""}
              meta={formatStamp(m.at)}
              testID={m.senderId === me ? "chat-bubble-me" : "chat-bubble-them"}
            />
          ) : null,
        )}
        {booking ? <ChatHandoffCard booking={booking} viewer={header.myRole} onChanged={() => void load()} openSignal={signals.handoff} /> : null}
        {booking ? <ChatCareCards booking={booking} viewer={header.myRole} askSignal={signals.photo} /> : null}
        {booking ? <ChatTripCard booking={booking} viewer={header.myRole} threadId={threadId} messages={messages} onSent={() => void load()} startSignal={signals.trip} /> : null}
      </Screen>
      {step.primary || step.quote || step.wait ? (
        <View style={styles.next}>
          {step.primary ? (
            <Button
              label={step.primary.label}
              disabled={stepBusy || (step.primary.kind === "confirm_quote" && step.primary.disabled)}
              onPress={() => void doPrimary(step.primary as Primary)}
              testID={step.primary.kind === "request" ? "chat-request-booking" : `chat-next-${step.primary.kind}`}
            />
          ) : step.quote ? (
            <Button label="Send quote" onPress={() => setQuoting("first")} testID="chat-send-quote" />
          ) : null}
          {step.primary && step.quote ? (
            <TextButton label="Send quote" onPress={() => setQuoting("first")} testID="chat-send-quote" />
          ) : null}
          {!step.primary && step.wait ? (
            <Text style={styles.waiting} testID="chat-waiting">
              {step.wait}
            </Text>
          ) : null}
        </View>
      ) : null}
      {text.trim() === "" && (drafting || chips.length > 0 || shownAction || (key !== null && !chipsReady)) ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsScroll} contentContainerStyle={styles.chips} keyboardShouldPersistTaps="handled" testID="chat-chips">
          {drafting || !chipsReady ? (
            <View style={styles.chipsBusy} testID="chat-chips-loading">
              <ActivityIndicator color={theme.color.primary} accessibilityLabel={drafting ? "Writing a draft" : "Writing replies"} />
              <Text style={styles.chipsBusyText}>{drafting ? "Writing your message…" : "Writing replies…"}</Text>
            </View>
          ) : null}
          {shownAction && chipsReady && !drafting ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => void doAction(shownAction)}
              style={[styles.chip, styles.actionChip]}
              testID="chat-action-chip"
            >
              <Ionicons name="flash-outline" size={14} color={theme.color.primaryText} />
              <Text style={[styles.chipText, styles.actionChipText]}>{shownAction.label}</Text>
            </Pressable>
          ) : null}
          {chips.map((chip, i) => (
            <Pressable
              key={chip.id}
              accessibilityRole="button"
              disabled={drafting}
              onPress={() => void pickChip(chip)}
              style={[styles.chip, drafting && styles.sendOff]}
              testID={`chat-chip-${i + 1}`}
            >
              <Text style={styles.chipText}>{chip.label}</Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}
      <View style={styles.compose}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Send a card"
          onPress={() => setPlusOpen(true)}
          style={styles.plusButton}
          testID="chat-plus"
        >
          <Ionicons name="add" size={24} color={theme.color.primary} />
        </Pressable>
        <TextInput
          ref={input}
          accessibilityLabel={`Message ${header.otherName}`}
          value={text}
          onChangeText={setText}
          placeholder={`Message ${header.otherName}`}
          placeholderTextColor={`${theme.color.textMuted}80`}
          maxLength={2000}
          multiline
          numberOfLines={1}
          onContentSizeChange={(e) => {
            if (Platform.OS !== "web") setInputHeight(Math.min(INPUT_MAX, Math.max(INPUT_MIN, Math.ceil(e.nativeEvent.contentSize.height) + INPUT_PAD * 2)));
          }}
          onKeyPress={(e) => {
            // Enter sends on the web, Shift+Enter is a new line; on a phone the keyboard's Enter is a new line.
            const ev = e.nativeEvent as unknown as { key: string; shiftKey?: boolean };
            if (Platform.OS === "web" && ev.key === "Enter" && !ev.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          style={[styles.input, Platform.OS === "web" ? null : { height: inputHeight }]}
          testID="chat-input"
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Send"
          disabled={sending || !text.trim()}
          onPress={() => void send()}
          style={[styles.sendButton, (sending || !text.trim()) && styles.sendOff]}
          testID="chat-send"
        >
          <Ionicons name="arrow-up" size={20} color={theme.color.primaryText} />
        </Pressable>
      </View>
      {owner && booking ? (
        <AgreeSheet visible={agreeing} booking={booking} onClose={() => setAgreeing(false)} onAgreed={() => void load()} />
      ) : null}
      {owner ? (
        <RequestBookingSheet
          visible={requesting}
          onClose={() => setRequesting(false)}
          threadId={threadId}
          sitterId={header.otherId}
          sitterName={header.otherName}
          stay={stay}
          onSent={() => void load()}
        />
      ) : null}
      {!owner ? (
        <>
          <SendQuoteSheet
            visible={quoting !== null}
            onClose={() => setQuoting(null)}
            threadId={threadId}
            sitterId={header.sitterId}
            stay={quoting === "final" ? finalStay : stay}
            final={quoting === "final"}
            onSent={() => void load()}
          />
          <AddFeeSheet visible={feeFor !== null} onClose={() => setFeeFor(null)} messageId={feeFor} onAdded={() => void load()} />
        </>
      ) : null}
      <ChatPlusMenu visible={plusOpen} items={plusItems} onClose={() => setPlusOpen(false)} />
      <PhotoViewerSheet visible={viewing} title={header.otherName} photos={photos} onClose={() => setViewing(false)} testID="chat-photos" />
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: theme.color.background },
    content: { gap: theme.spacing.sm },
    hint: { fontSize: theme.fontSize.small, color: theme.color.textMuted, textAlign: "center", paddingVertical: theme.spacing.md },
    stage: { paddingHorizontal: theme.spacing.md, paddingTop: theme.spacing.sm, maxWidth: 480, width: "100%", alignSelf: "center" },
    cardRow: { width: "100%" },
    cardWide: { width: "100%", alignItems: "center" },
    waiting: { fontSize: theme.fontSize.small, color: theme.color.textMuted, textAlign: "center", paddingVertical: theme.spacing.xs },
    cardMine: { alignItems: "flex-end" },
    cardTheirs: { alignItems: "flex-start" },
    stay: { gap: 2, maxWidth: "88%" },
    request: { gap: 2, maxWidth: "88%" },
    requestTitle: { fontSize: theme.fontSize.body, fontWeight: theme.fontWeight.bold, color: theme.color.text },
    requestLine: { fontSize: theme.fontSize.small, color: theme.color.textMuted },
    requestNote: { fontSize: theme.fontSize.small, color: theme.color.text, fontStyle: "italic", marginTop: 2 },
    requestLive: { fontSize: theme.fontSize.small, fontWeight: theme.fontWeight.bold, color: theme.color.primary, marginTop: 2 },
    next: { paddingHorizontal: theme.spacing.md, paddingTop: theme.spacing.sm, maxWidth: 480, width: "100%", alignSelf: "center" },
    chipsScroll: { flexGrow: 0, maxWidth: 480, width: "100%", alignSelf: "center" },
    chips: { flexDirection: "row", alignItems: "center", gap: theme.spacing.xs, paddingHorizontal: theme.spacing.md, paddingTop: theme.spacing.xs },
    chip: { height: 30, justifyContent: "center", paddingHorizontal: theme.spacing.sm, borderRadius: 15, borderWidth: 1, borderColor: theme.color.primary, backgroundColor: theme.color.surface },
    actionChip: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: theme.color.primary },
    actionChipText: { color: theme.color.primaryText },
    chipsBusy: { flexDirection: "row", alignItems: "center", gap: theme.spacing.xs, minHeight: 36 },
    chipsBusyText: { fontSize: theme.fontSize.small, color: theme.color.textMuted },
    chipText: { fontSize: theme.fontSize.small, fontWeight: theme.fontWeight.semibold, color: theme.color.primary },
    compose: {
      flexDirection: "row",
      alignItems: "flex-end",
      gap: theme.spacing.sm,
      padding: theme.spacing.md,
      maxWidth: 480,
      width: "100%",
      alignSelf: "center",
    },
    input: {
      flex: 1,
      minHeight: INPUT_MIN,
      paddingHorizontal: theme.spacing.md,
      paddingVertical: INPUT_PAD,
      textAlignVertical: "top",
      borderRadius: 22,
      borderWidth: 1,
      borderColor: theme.color.border,
      backgroundColor: theme.color.surface,
      fontSize: theme.fontSize.body,
      color: theme.color.text,
    },
    plusButton: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: theme.color.border, backgroundColor: theme.color.surface },
    sendButton: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: theme.color.primary },
    sendOff: { opacity: 0.4 },
  });
