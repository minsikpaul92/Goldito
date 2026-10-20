import Ionicons from "@expo/vector-icons/Ionicons";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { BookingStageBar, hasStageBar, stageCaption } from "../../components/BookingStageBar";
import { ChatHeaderTitle, HeaderStay } from "../../components/ChatHeaderTitle";
import { MessageBubble } from "../../components/MessageBubble";
import { PhotoViewerSheet } from "../../components/PhotoViewerSheet";
import { RequestBookingSheet } from "../../components/RequestBookingSheet";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { EmptyState } from "../../components/ui/EmptyState";
import { LoadingView } from "../../components/ui/LoadingView";
import { Screen } from "../../components/ui/Screen";
import {
  ChatCard,
  ChatHeader,
  ChatMessage,
  getChatHeader,
  loadChatMessages,
  markChatRead,
  sendChatMessage,
} from "../../features/chat/chatApi";
import { ChatChip, chipsFor, fetchChatDraft } from "../../features/chat/chatAi";
import { useLiveChat } from "../../features/chat/useLiveChat";
import { useMyPets } from "../../features/pets/useMyPets";
import { ProfilePhoto, loadProfilePhotos } from "../../features/profile/profilePhotosApi";
import { formatDay, formatStamp, formatTime, isoToZoned } from "../../features/schedule/dates";
import { SERVICE_LABEL } from "../../features/sitters/sitterApi";
import { BookingSummary, listOwnerBookings, listSitterBookings } from "../../lib/bookings";
import { useErrorDialog } from "../../providers/ErrorDialogProvider";
import { useSession } from "../../providers/SessionProvider";
import { useTheme, useThemedStyles } from "../../providers/ThemeProvider";
import { Theme } from "../../theme/themes";

type Loaded = { header: ChatHeader; messages: ChatMessage[]; booking: BookingSummary | null };
type StayCard = Extract<ChatCard, { type: "stay" }>;
type RequestCard = Extract<ChatCard, { type: "request" }>;

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
  const blocks = theme.ui.blocks;
  // The text an AI chip last put in the box, so the box can say it's a draft until it's sent.
  const [draftText, setDraftText] = useState<string | null>(null);
  const [inputHeight, setInputHeight] = useState(44);
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
  const [chips, setChips] = useState<ChatChip[]>([]);
  const [drafting, setDrafting] = useState(false);
  const input = useRef<TextInput>(null);

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
      // The newest booking of this pair that still has a progress bar.
      const booking = bookings.find((b) => b.ownerId === header.ownerId && b.sitterId === header.sitterId && hasStageBar(b)) ?? null;
      setLoaded({ header, messages, booking });
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

  // Chips for what the other person just wrote (or openers in an empty chat). The slot is there from the start with a
  // spinner, so nothing jumps when they arrive; the list may have asked ahead, then they are ready at once.
  const all = loaded?.messages;
  const lastText = all?.filter((m) => m.kind === "text").at(-1);
  const waitingForMe = !!all && (lastText ? lastText.senderId !== profile?.id : loaded?.header.myRole === "owner");
  const latestAt = all?.at(-1)?.at ?? "none";
  const key = loaded && waitingForMe ? `${threadId}:${latestAt}` : null;
  const [chipsReady, setChipsReady] = useState(false);
  useEffect(() => {
    setChips([]);
    setChipsReady(false);
    if (!key) return;
    let current = true;
    void chipsFor(threadId, latestAt).then((r) => {
      if (!current) return;
      setChips(r?.chips ?? []);
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
      setDraftText(draft);
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

  const { header, messages, booking } = loaded;
  const me = profile?.id;
  const owner = header.myRole === "owner";

  // The stay in the header is the latest one asked about or requested.
  const latest = [...messages].reverse().find((m) => m.card?.type === "stay" || m.card?.type === "request")?.card as StayCard | RequestCard | undefined;
  const stay: StayCard | null = latest ? { type: "stay", dropOffAt: latest.dropOffAt, pickUpAt: latest.pickUpAt, pets: latest.pets } : null;
  const headerStay: HeaderStay | null = stay ? { ...stay, pets: stay.pets.map((p) => ({ ...p, species: pets.find((x) => x.id === p.id)?.species })) } : null;
  // No booking in progress (a finished stay does not count): the owner's next step is the request.
  const canRequest = owner && (!booking || booking.stage === "completed");

  const send = async () => {
    const body = text.trim();
    if (sending || !body) return;
    setSending(true);
    try {
      await sendChatMessage(threadId, body);
      setText("");
      setDraftText(null);
      setInputHeight(44);
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
      <Card style={styles.request} tone={blocks ? "mint" : undefined} testID="chat-request-card">
        <Text style={[styles.requestTitle, blocks && styles.cardTitleDisplay]}>{mine ? "You sent a booking request" : "Booking request"}</Text>
        <Text style={styles.requestLine}>{`${SERVICE_LABEL[c.serviceType].replace(/^\S+\s/, "")} · ${c.pets.map((p) => p.name).join(", ")}`}</Text>
        <View style={styles.cardLine}>
          <Ionicons name="log-in-outline" size={16} color={theme.color.textMuted} accessibilityElementsHidden importantForAccessibility="no" />
          <Text style={styles.requestLine}>{`Drop-off ${short(c.dropOffAt)} · ${placeText(c.dropOffPlace, mine ? header.otherName : (profile?.displayName ?? "the sitter"))}`}</Text>
        </View>
        <View style={styles.cardLine}>
          <Ionicons name="log-out-outline" size={16} color={theme.color.textMuted} accessibilityElementsHidden importantForAccessibility="no" />
          <Text style={styles.requestLine}>{`Pick-up ${short(c.pickUpAt)} · ${placeText(c.pickUpPlace, mine ? header.otherName : (profile?.displayName ?? "the sitter"))}`}</Text>
        </View>
        {c.note ? <Text style={styles.requestNote} testID="chat-request-note">{`“${c.note}”`}</Text> : null}
        {live ? <Text style={styles.requestLive}>{live}</Text> : null}
      </Card>
      </View>
    );
  };

  const bookingPath = booking ? `/${header.myRole}/bookings/${booking.id}` : null;

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
      <Screen ref={scroller} contentStyle={styles.content} testID="chat-scroll">
        {booking && bookingPath ? (
          <Pressable accessibilityRole="button" onPress={() => router.push(bookingPath as never)} testID="chat-stage">
            <Card>
              <BookingStageBar booking={booking} viewer={header.myRole} />
            </Card>
          </Pressable>
        ) : null}
        {messages.length === 0 ? (
          <Text style={styles.hint} testID="chat-empty">{`Say hi to ${header.otherName}.`}</Text>
        ) : null}
        {messages.map((m) =>
          m.kind === "card" && m.card?.type === "stay" ? (
            <View key={m.id} style={[styles.cardRow, m.senderId === me ? styles.cardMine : styles.cardTheirs]}>
              <Card style={styles.stay} tone={blocks ? "butter" : undefined} testID="chat-stay-card">
                <Text style={[styles.requestTitle, blocks && styles.cardTitleDisplay]}>Stay</Text>
                <View style={styles.cardLine}>
                  <Ionicons name="log-in-outline" size={16} color={theme.color.textMuted} accessibilityElementsHidden importantForAccessibility="no" />
                  <Text style={styles.requestLine}>{`Drop-off ${short(m.card.dropOffAt)}`}</Text>
                </View>
                <View style={styles.cardLine}>
                  <Ionicons name="log-out-outline" size={16} color={theme.color.textMuted} accessibilityElementsHidden importantForAccessibility="no" />
                  <Text style={styles.requestLine}>{`Pick-up ${short(m.card.pickUpAt)}`}</Text>
                </View>
                <View style={styles.cardLine}>
                  <Ionicons name="paw-outline" size={16} color={theme.color.textMuted} accessibilityElementsHidden importantForAccessibility="no" />
                  <Text style={styles.requestLine}>{m.card.pets.map((p) => p.name).join(", ")}</Text>
                </View>
              </Card>
            </View>
          ) : m.kind === "card" && m.card?.type === "request" ? (
            requestCard(m, m.card)
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
      </Screen>
      {canRequest ? (
        <View style={styles.next}>
          <Button label="Request booking" onPress={() => setRequesting(true)} testID="chat-request-booking" />
        </View>
      ) : null}
      {text.trim() === "" && (drafting || chips.length > 0 || (key !== null && !chipsReady)) ? (
        <View style={styles.chips} testID="chat-chips">
          {!drafting && chipsReady && chips.length > 0 ? (
            <View style={styles.chipsLabel}>
              <Ionicons name="sparkles" size={14} color={theme.color.primary} accessibilityElementsHidden importantForAccessibility="no" />
              <Text style={styles.chipsLabelText}>Reply ideas</Text>
            </View>
          ) : null}
          {drafting || !chipsReady ? (
            <View style={styles.chipsBusy} testID="chat-chips-loading">
              <ActivityIndicator color={theme.color.primary} accessibilityLabel={drafting ? "Writing a draft" : "Writing replies"} />
              <Text style={styles.chipsBusyText}>{drafting ? "Writing your message…" : "Writing replies…"}</Text>
            </View>
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
        </View>
      ) : null}
      {draftText !== null && text.trim() !== "" ? (
        <View style={styles.draftNote} testID="chat-draft-note">
          <Ionicons name="sparkles" size={14} color={theme.color.primary} accessibilityElementsHidden importantForAccessibility="no" />
          <Text style={styles.draftNoteText}>{text === draftText ? "AI draft · edit before sending" : "Edited AI draft"}</Text>
        </View>
      ) : null}
      <View style={styles.compose}>
        <TextInput
          ref={input}
          accessibilityLabel={`Message ${header.otherName}`}
          value={text}
          onChangeText={setText}
          placeholder={`Message ${header.otherName}`}
          placeholderTextColor={`${theme.color.textMuted}80`}
          maxLength={2000}
          multiline
          // Enter sends, Shift+Enter is a new line (web); the box grows to about four lines so an AI draft can be read whole.
          onKeyPress={(e) => {
            const ev = e.nativeEvent as { key: string; shiftKey?: boolean };
            if (ev.key === "Enter" && !ev.shiftKey) {
              (e as unknown as { preventDefault?: () => void }).preventDefault?.();
              void send();
            }
          }}
          onContentSizeChange={(e) => setInputHeight(Math.min(120, Math.max(44, Math.ceil(e.nativeEvent.contentSize.height))))}
          style={[styles.input, { height: inputHeight }]}
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
      <PhotoViewerSheet visible={viewing} title={header.otherName} photos={photos} onClose={() => setViewing(false)} testID="chat-photos" />
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: theme.color.background },
    content: { gap: theme.spacing.sm },
    hint: { fontSize: theme.fontSize.small, color: theme.color.textMuted, textAlign: "center", paddingVertical: theme.spacing.md },
    cardRow: { width: "100%" },
    cardMine: { alignItems: "flex-end" },
    cardTheirs: { alignItems: "flex-start" },
    stay: { gap: 2, maxWidth: "88%" },
    request: { gap: 2, maxWidth: "88%" },
    cardLine: { flexDirection: "row", alignItems: "center", gap: theme.spacing.xs },
    cardTitleDisplay: theme.fontFamily.display ? { fontFamily: theme.fontFamily.display, fontWeight: undefined, fontSize: 18 } : {},
    chipsLabel: { flexDirection: "row", alignItems: "center", gap: 4, minHeight: 36, paddingRight: theme.spacing.xs },
    chipsLabelText: { fontSize: theme.fontSize.small, fontWeight: theme.fontWeight.semibold, color: theme.color.textMuted },
    draftNote: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: theme.spacing.md + theme.spacing.xs, paddingTop: theme.spacing.sm, maxWidth: 480, width: "100%", alignSelf: "center" },
    draftNoteText: { fontSize: theme.fontSize.small, fontWeight: theme.fontWeight.semibold, color: theme.color.primary },
    requestTitle: { fontSize: theme.fontSize.body, fontWeight: theme.fontWeight.bold, color: theme.color.text },
    requestLine: { fontSize: theme.fontSize.small, color: theme.color.textMuted },
    requestNote: { fontSize: theme.fontSize.small, color: theme.color.text, fontStyle: "italic", marginTop: 2 },
    requestLive: { fontSize: theme.fontSize.small, fontWeight: theme.fontWeight.bold, color: theme.color.primary, marginTop: 2 },
    next: { paddingHorizontal: theme.spacing.md, paddingTop: theme.spacing.sm, maxWidth: 480, width: "100%", alignSelf: "center" },
    chips: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: theme.spacing.xs, paddingHorizontal: theme.spacing.md, paddingTop: theme.spacing.xs, maxWidth: 480, width: "100%", alignSelf: "center" },
    chip: { minHeight: 36, justifyContent: "center", paddingHorizontal: theme.spacing.md, borderRadius: 18, borderWidth: 1, borderColor: theme.color.primary, backgroundColor: theme.color.surface },
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
      minHeight: 44,
      maxHeight: 120,
      paddingHorizontal: theme.spacing.md,
      paddingVertical: 11,
      borderRadius: 22,
      borderWidth: 1,
      borderColor: theme.color.border,
      backgroundColor: theme.color.surface,
      fontSize: theme.fontSize.body,
      color: theme.color.text,
    },
    sendButton: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: theme.color.primary },
    sendOff: { opacity: 0.4 },
  });
