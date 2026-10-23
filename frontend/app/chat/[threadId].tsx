import Ionicons from "@expo/vector-icons/Ionicons";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { AgreeSheet } from "../../components/AgreeSheet";
import { ChatDeclineSheet } from "../../components/ChatDeclineSheet";
import { BookingStageBar, hasStageBar, stageCaption } from "../../components/BookingStageBar";
import { ChatAgreementCard, ChatPaymentCard } from "../../components/ChatBookingCards";
import { ChatCareCards } from "../../components/ChatCareCards";
import { ChatHandoffCard } from "../../components/ChatHandoffCard";
import { ChatPlusMenu, PlusItem } from "../../components/ChatPlusMenu";
import { ChatQuoteCard } from "../../components/ChatQuoteCard";
import { ChatStayCard } from "../../components/ChatStayCard";
import { ChatTripCard } from "../../components/ChatTripCard";
import { SendQuoteSheet } from "../../components/ChatQuoteSheets";
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
  confirmQuote,
  getChatHeader,
  loadChatMessages,
  markChatRead,
  sendChatMessage,
} from "../../features/chat/chatApi";
import { ChatAction, ChatChip, TYPED_PAUSE_MS, chipsFor, fetchChatDraft, fetchTypedChips } from "../../features/chat/chatAi";
import { NextStep, Primary, actionPossible, finalQuote, hasPaymentCard, nextStep } from "../../features/chat/nextStep";
import { inCare } from "../../features/chat/careCards";
import { arrivedForNext, canReceiveNow, canReturnNow, canStartTripNow, canTravel, nextHandoff, startOpensAt } from "../../features/transit/tripLogic";
import { useLiveTrips } from "../../features/transit/useLiveTrips";
import { meetGreetPrimary } from "../../lib/meetGreet";
import { useLiveChat } from "../../features/chat/useLiveChat";
import { SPECIES_EMOJI } from "../../features/pets/petFormat";
import type { Species } from "../../types/db";
import { useMyPets } from "../../features/pets/useMyPets";
import { ProfilePhoto, loadProfilePhotos } from "../../features/profile/profilePhotosApi";
import { formatDay, formatStamp, formatTime, isoToZoned } from "../../features/schedule/dates";
import { SERVICE_LABEL } from "../../features/sitters/sitterApi";
import { BookingSummary, expressInterest, listOwnerBookings, listSitterBookings, respondBooking } from "../../lib/bookings";
import { useErrorDialog } from "../../providers/ErrorDialogProvider";
import { useSession } from "../../providers/SessionProvider";
import { useTheme, useThemedStyles } from "../../providers/ThemeProvider";
import { Theme } from "../../theme/themes";
import { selectable } from "../../components/ui/selectable";

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
/** Footer steps that get a Decline next to them (#230): the owner's yes, the sitter's yes, the owner's final quote. */
const DECLINABLE: Primary["kind"][] = ["agree", "accept", "confirm_quote"];

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
  /** Decline at the agreement step or on the final quote (#230); `quote` when it is the final quote. */
  const [declining, setDeclining] = useState<{ quote: boolean } | null>(null);
  const [plusOpen, setPlusOpen] = useState(false);
  const [signals, setSignals] = useState({ handoff: 0, trip: 0, photo: 0, receive: 0, returned: 0 });
  const [stepBusy, setStepBusy] = useState(false);
  const meetCard = useRef<MeetGreetHandle>(null);
  const [quoteBusy, setQuoteBusy] = useState(false);
  const [chips, setChips] = useState<ChatChip[]>([]);
  const [action, setAction] = useState<ChatAction | null>(null);
  const [drafting, setDrafting] = useState(false);
  // Chips that follow the typed text: null = none (the usual chips show when the box is empty), "busy" = asking.
  const [typedChips, setTypedChips] = useState<ChatChip[] | "busy" | null>(null);
  const draftedText = useRef<string | null>(null);
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
    const draft = await fetchChatDraft(threadId, chip.label, text);
    setDrafting(false);
    if (draft) {
      draftedText.current = draft;
      setText(draft);
      setTypedChips(null);
      input.current?.focus();
    }
  };

  // When the box has text and stays still for a moment, the chips follow it: a spinner, then chips that fit. Emptying the
  // box brings the usual chips back. The AI only words; the person presses Send (D62).
  useEffect(() => {
    const typed = text.trim();
    setTypedChips(null);
    if (!typed || typed === draftedText.current?.trim()) return;
    let current = true;
    const timer = setTimeout(() => {
      setTypedChips("busy");
      void fetchTypedChips(threadId, typed).then((r) => {
        if (current) setTypedChips(r);
      });
    }, TYPED_PAUSE_MS);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [text, threadId]);

  // Open at the latest message, and follow new ones.
  const count = loaded?.messages.length ?? 0;
  useEffect(() => {
    if (count !== lastCount.current) {
      lastCount.current = count;
      setTimeout(() => scroller.current?.scrollToEnd({ animated: false }), 50);
    }
  }, [count]);

  // The pair's trips, for the + menu's Start trip (#250): none once the open handoff's trip got there.
  const { trips: pairTrips } = useLiveTrips(loaded?.booking?.id, !!loaded?.booking?.paidAt);

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
  // A stay that is over has nothing left to press (no Send quote, no Request booking), unless a newer stay card was started.
  const returnedStay = pairBookings.find((b) => b.status === "confirmed" && !!b.paidAt && !!b.pickUp?.completedAt);

  // The stay card in one line (#227): "Oct 21 9:00 AM to Oct 24 5:00 PM · 2 pets: 🐶 Max, 🐱 Mochi". The card holds
  // names only, so the species comes from what this screen already has: the owner's own pets and the pets on this
  // pair's bookings (both sides). A pet with no known species shows its name alone, never a guessed emoji.
  const speciesById = new Map<string, Species>();
  for (const p of pets) speciesById.set(p.id, p.species);
  for (const b of pairBookings) for (const p of b.pets) if (p.id) speciesById.set(p.id, p.species);
  const stayLine = (c: StayCard) => {
    const names = c.pets
      .map((p) => {
        const species = speciesById.get(p.id);
        return species ? `${SPECIES_EMOJI[species]} ${p.name}` : p.name;
      })
      .join(", ");
    return `${short(c.dropOffAt)} to ${short(c.pickUpAt)} · ${c.pets.length > 1 ? `${c.pets.length} pets: ` : ""}${names}`;
  };
  const newerBooking = !!booking && booking.id !== returnedStay?.id;
  const latestCardAt = [...messages].reverse().find((m) => m.card?.type === "stay" || m.card?.type === "request")?.at;
  const finished = !!returnedStay && !newerBooking && (!latestCardAt || Date.parse(latestCardAt) < Date.parse(returnedStay.pickUp?.completedAt ?? ""));
  const step: NextStep = finished
    ? { primary: null, quote: false, wait: null }
    : nextStep({
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
          service: booking.serviceType,
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
  const typing = text.trim() !== "";
  const typedBusy = typing && (typedChips === "busy" || drafting);
  const typingChips = typing && (typedBusy || Array.isArray(typedChips));
  const shownAction = action && actionPossible(action.id, step, booking, header.myRole) ? action : null;

  // The stay itself (Received, in care, Returned) follows the pair's paid booking even after the progress bar is done.
  const stayBooking = booking ?? pairBookings.find((b) => b.status === "confirmed" && !!b.paidAt) ?? null;

  // The + menu (#235): each entry opens what the flow opens. Entries that cannot work right now are dimmed.
  const bump = (key: "handoff" | "trip" | "photo" | "receive" | "returned") => setSignals((n) => ({ ...n, [key]: n[key] + 1 }));
  const quoteKind = booking && hasPaymentCard(messages, booking.id) ? "final" : "first";
  // Why Start trip is dimmed for the person who travels: it opens 2 hours before the handoff (#250).
  const tripNext = booking?.paidAt ? nextHandoff(booking) : null;
  const tripOpens = tripNext && canTravel(header.myRole, tripNext.handoff.locationType) ? startOpensAt(tripNext.handoff) : null;
  const tripOpensHint =
    tripOpens !== null && Date.now() < tripOpens ? `From ${formatTime(isoToZoned(new Date(tripOpens).toISOString()).time)}` : undefined;
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
            enabled: !finished && (quoteKind === "final" ? !!finalStay : !!stay),
            onPress: () => setQuoting(quoteKind),
          },
        ]
      : []),
    ...(owner
      ? [
          {
            id: "quote-request",
            label: "Quote request",
            icon: "chatbox-ellipses-outline" as const,
            enabled: !finished && !!stay && !priced,
            onPress: () => {
              setText("Could you send me a quote for these dates?");
              input.current?.focus();
            },
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
      enabled: !!booking && canStartTripNow(booking, header.myRole) && !arrivedForNext(booking, pairTrips),
      hint: tripOpensHint,
      onPress: () => bump("trip"),
    },
    ...(!owner
      ? [
          {
            id: "received",
            label: "Received",
            icon: "enter-outline" as const,
            // Same rule as the trip card (#250): only once the drop-off trip got there. With no trip at all, the
            // booking page keeps its Received.
            enabled: canReceiveNow(stayBooking) && !!stayBooking && arrivedForNext(stayBooking, pairTrips),
            hint: canReceiveNow(stayBooking) ? "After the arrival" : undefined,
            onPress: () => bump("receive"),
          },
          {
            id: "returned",
            label: "Returned",
            icon: "exit-outline" as const,
            enabled: canReturnNow(stayBooking),
            onPress: () => bump("returned"),
          },
        ]
      : []),
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
            <BookingStageBar booking={booking} viewer={header.myRole} chat trips={pairTrips} />
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
                <Text style={styles.requestLine} testID="chat-stay-line">
                  {stayLine(m.card)}
                </Text>
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
                onConfirm={() => void quoteAction(() => confirmQuote(m.id))}
                onDecline={isFinal(m.id) && booking ? () => setDeclining({ quote: true }) : undefined}
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
        {stayBooking ? <ChatStayCard booking={stayBooking} viewer={header.myRole} onChanged={() => void load()} receiveSignal={signals.receive} returnSignal={signals.returned} /> : null}
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
          {step.primary && booking && DECLINABLE.includes(step.primary.kind) ? (
            <TextButton
              label="Decline"
              danger
              disabled={stepBusy}
              onPress={() => setDeclining({ quote: step.primary?.kind === "confirm_quote" })}
              testID="chat-decline"
            />
          ) : null}
          {!step.primary && step.wait ? (
            <Text style={styles.waiting} testID="chat-waiting">
              {step.wait}
            </Text>
          ) : null}
        </View>
      ) : null}
      {typingChips || (!typing && (drafting || chips.length > 0 || shownAction || (key !== null && !chipsReady))) ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsScroll} contentContainerStyle={styles.chips} keyboardShouldPersistTaps="handled" testID="chat-chips">
          {typing ? (
            <>
              {typedBusy ? (
            <View style={styles.chipsBusy} testID="chat-chips-loading">
                  <ActivityIndicator color={theme.color.primary} accessibilityLabel={drafting ? "Writing your message" : "Finding replies"} />
                  <Text style={styles.chipsBusyText}>{drafting ? "Writing your message…" : "Finding replies…"}</Text>
                </View>
              ) : null}
              {!typedBusy && Array.isArray(typedChips)
                ? typedChips.map((chip, i) => (
                    <Pressable
                      key={chip.id}
                      accessibilityRole="button"
                      onPress={() => void pickChip(chip)}
                      style={styles.chip}
                      testID={`chat-chip-${i + 1}`}
                    >
                      <Text style={styles.chipText}>{chip.label}</Text>
                    </Pressable>
                  ))
                : null}
            </>
          ) : (
            <>
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
                    </>
          )}
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
          placeholderTextColor={theme.color.placeholder}
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
      {booking && declining ? (
        <ChatDeclineSheet
          visible
          bookingId={booking.id}
          role={header.myRole}
          otherName={header.otherName}
          quote={declining.quote}
          onClose={() => setDeclining(null)}
          onDone={() => {
            setDeclining(null);
            void load();
          }}
        />
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
    // Reply chips share the picker look (selectable); the action chip stays ink because it does something (F06: 44 px).
    chip: selectable(theme).chip,
    actionChip: { backgroundColor: theme.color.primary, borderColor: theme.color.primary },
    actionChipText: { color: theme.color.primaryText },
    chipsBusy: { flexDirection: "row", alignItems: "center", gap: theme.spacing.xs, minHeight: 36 },
    chipsBusyText: { fontSize: theme.fontSize.small, color: theme.color.textMuted },
    chipText: { ...selectable(theme).label, fontSize: theme.fontSize.small },
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
