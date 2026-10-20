import { router, Stack, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { BookingStageBar, hasStageBar } from "../../components/BookingStageBar";
import { MessageBubble } from "../../components/MessageBubble";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { EmptyState } from "../../components/ui/EmptyState";
import { LoadingView } from "../../components/ui/LoadingView";
import { Screen } from "../../components/ui/Screen";
import { TextButton } from "../../components/ui/TextButton";
import { TextField } from "../../components/ui/TextField";
import {
  ChatHeader,
  ChatMessage,
  getChatHeader,
  leaveChat,
  loadChatMessages,
  markChatRead,
  sendChatMessage,
} from "../../features/chat/chatApi";
import { useLiveChat } from "../../features/chat/useLiveChat";
import { formatStamp } from "../../features/schedule/dates";
import { BookingSummary, listOwnerBookings, listSitterBookings } from "../../lib/bookings";
import { useErrorDialog } from "../../providers/ErrorDialogProvider";
import { useSession } from "../../providers/SessionProvider";
import { useThemedStyles } from "../../providers/ThemeProvider";
import { useToast } from "../../providers/ToastProvider";
import { Theme } from "../../theme/themes";

type Loaded = { header: ChatHeader; messages: ChatMessage[]; booking: BookingSummary | null };

/**
 * One chat per owner and sitter (3D.4): the booking progress on top, the stay card and then everyone's messages,
 * and a box to write any time. Opens at the latest message and keeps itself current (Realtime + a slow poll).
 */
export default function Chat() {
  const styles = useThemedStyles(makeStyles);
  const { threadId } = useLocalSearchParams<{ threadId: string }>();
  const { profile } = useSession();
  const toast = useToast();
  const errorDialog = useErrorDialog();
  const scroller = useRef<ScrollView>(null);
  const lastCount = useRef(0);
  const [loaded, setLoaded] = useState<Loaded | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);

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

  const leave = async () => {
    try {
      await leaveChat(threadId);
      toast.show("Left the chat");
      router.back();
    } catch (e) {
      errorDialog.show({ title: "Couldn't leave", message: (e as Error).message });
    }
  };

  const bookingPath = booking ? `/${header.myRole}/bookings/${booking.id}` : null;
  // No booking in progress (a finished stay does not count): the owner's next step is the request, filled in from the latest stay card. The chat
  // steps that replace this screen (quote, agreement, payment) come with 3D.6 and 3D.7.
  const stayCard = [...messages].reverse().find((m) => m.card?.type === "stay")?.card;
  const requestHref =
    header.myRole === "owner" && (!booking || booking.stage === "completed")
      ? `/owner/bookings/new?${new URLSearchParams({
          sitter: header.otherId,
          ...(stayCard?.type === "stay"
            ? { drop: stayCard.dropOffAt, pick: stayCard.pickUpAt, pets: stayCard.pets.map((p) => p.id).join(",") }
            : {}),
        }).toString()}`
      : null;

  return (
    <View style={styles.root} testID="chat">
      <Stack.Screen
        options={{
          title: header.otherName,
          headerRight: () => <TextButton label="Leave" onPress={() => void leave()} testID="chat-leave" />,
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
            <Card key={m.id} style={styles.stay} testID="chat-stay-card">
              <Text style={styles.stayTitle}>Stay</Text>
              <Text style={styles.stayLine}>{`Drop-off ${formatStamp(m.card.dropOffAt)}`}</Text>
              <Text style={styles.stayLine}>{`Pick-up ${formatStamp(m.card.pickUpAt)}`}</Text>
              <Text style={styles.stayLine}>{m.card.pets.map((p) => p.name).join(", ")}</Text>
            </Card>
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
      {requestHref ? (
        <View style={styles.next}>
          <Button label="Request booking" onPress={() => router.push(requestHref as never)} testID="chat-request-booking" />
        </View>
      ) : null}
      <View style={styles.compose}>
        <View style={styles.input}>
          <TextField
            label=""
            value={text}
            placeholder={`Message ${header.otherName}`}
            multiline
            maxLength={2000}
            onChangeText={setText}
            testID="chat-input"
          />
        </View>
        <Button label={sending ? "…" : "Send"} onPress={() => void send()} disabled={sending || !text.trim()} testID="chat-send" />
      </View>
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: theme.color.background },
    content: { gap: theme.spacing.sm },
    hint: { fontSize: theme.fontSize.small, color: theme.color.textMuted, textAlign: "center", paddingVertical: theme.spacing.md },
    stay: { gap: 2 },
    stayTitle: { fontSize: theme.fontSize.body, fontWeight: theme.fontWeight.bold, color: theme.color.text },
    stayLine: { fontSize: theme.fontSize.small, color: theme.color.textMuted },
    next: { paddingHorizontal: theme.spacing.md, paddingTop: theme.spacing.sm, maxWidth: 480, width: "100%", alignSelf: "center" },
    compose: {
      flexDirection: "row",
      alignItems: "flex-end",
      gap: theme.spacing.sm,
      padding: theme.spacing.md,
      maxWidth: 480,
      width: "100%",
      alignSelf: "center",
    },
    input: { flex: 1 },
  });
