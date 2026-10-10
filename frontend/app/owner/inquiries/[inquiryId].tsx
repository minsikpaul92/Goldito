import { router, Stack, useLocalSearchParams } from "expo-router";
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
import { InquiryView, getInquiry, tripSummary } from "../../../features/inquiries/inquiryApi";
import { formatTime, isoToZoned } from "../../../features/schedule/dates";
import { useThemedStyles } from "../../../providers/ThemeProvider";
import { Theme } from "../../../theme/themes";

const POLL_MS = 3000;

/**
 * The owner's side of one inquiry (phase-07B 7B.5): their question, then the sitter's reply — shown as the
 * sitter's own message, with the quote and where the answer came from. While nothing has been sent yet it says so;
 * a draft the sitter hasn't approved is never visible here (RLS).
 */
export default function OwnerInquiry() {
  const styles = useThemedStyles(makeStyles);
  const { inquiryId } = useLocalSearchParams<{ inquiryId: string }>();
  const [inquiry, setInquiry] = useState<InquiryView | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setInquiry(await getInquiry(inquiryId));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [inquiryId]);

  const reply = inquiry?.messages.find((m) => m.author === "sitter");
  // Auto-send: "typing…" between the two times the server stored, then the message itself (RLS shows it from then on).
  const [now, setNow] = useState(() => Date.now());
  const typingAt = inquiry?.replyTypingAt ? Date.parse(inquiry.replyTypingAt) : null;
  const visibleAt = inquiry?.replyVisibleAt ? Date.parse(inquiry.replyVisibleAt) : null;
  const scheduled = !reply && visibleAt != null && visibleAt > now;
  const typing = scheduled && typingAt != null && now >= typingAt;
  useEffect(() => {
    if (!scheduled || visibleAt == null) return;
    const tick = setInterval(() => setNow(Date.now()), 1000);
    const show = setTimeout(() => void load(), Math.max(0, visibleAt - Date.now()) + 400);
    return () => {
      clearInterval(tick);
      clearTimeout(show);
    };
  }, [scheduled, visibleAt, load]);
  useEffect(() => {
    void load();
  }, [load]);
  // Wait for the sitter with a slow poll; stops once the reply is in.
  useEffect(() => {
    if (reply || inquiry === null) return;
    const timer = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(timer);
  }, [reply, inquiry, load]);

  if (error && inquiry === undefined) {
    return (
      <Screen>
        <EmptyState emoji="💬" title="Couldn't load this conversation" message={error} action={{ label: "Try again", onPress: () => void load() }} />
      </Screen>
    );
  }
  if (inquiry === undefined) return <LoadingView />;
  if (inquiry === null) {
    return (
      <Screen>
        <EmptyState emoji="💬" title="Conversation not found" message="This question isn't available." />
      </Screen>
    );
  }

  const question = inquiry.messages.find((m) => m.author === "owner");
  const when = (at: string) => `${isoToZoned(at).day.slice(5)} ${formatTime(isoToZoned(at).time)}`;
  const canHost = reply?.canHost !== false;

  return (
    <Screen testID="owner-inquiry" contentStyle={styles.content}>
      <Stack.Screen options={{ title: inquiry.sitterName }} />
      <Card style={styles.trip}>
        <Text style={styles.tripTitle} testID="inquiry-trip">
          {tripSummary(inquiry.serviceType, inquiry.dropOffAt, inquiry.pickUpAt, inquiry.petNames)}
        </Text>
        <Text style={styles.muted}>{`Drop-off ${when(inquiry.dropOffAt)} · Pick-up ${when(inquiry.pickUpAt)}`}</Text>
      </Card>

      {question ? <MessageBubble side="me" body={question.body} meta={question.readAt ? `${when(question.at)} · Read` : when(question.at)} testID="inquiry-question-bubble" /> : null}

      {reply ? (
        <MessageBubble side="them" body={reply.body} meta={when(reply.at)} testID="inquiry-reply-bubble">
          {reply.sources.length > 0 ? (
            <View style={styles.sources} testID="inquiry-sources">
              {[...new Set(reply.sources.map((s) => s.label))].map((label) => (
                <Chip key={label} label={label} />
              ))}
            </View>
          ) : null}
        </MessageBubble>
      ) : (
        <View style={styles.waiting} testID="inquiry-waiting">
          {typing ? (
            <Text style={styles.typing} testID="inquiry-typing">{`${inquiry.sitterName} is typing…`}</Text>
          ) : (
            <>
              <Text style={styles.muted}>{`${inquiry.sitterName} will reply soon.`}</Text>
              <Text style={styles.muted}>You'll get a notification when they do.</Text>
            </>
          )}
        </View>
      )}

      {reply?.quote && canHost ? <QuoteCard quote={reply.quote} testID="inquiry-quote" /> : null}

      {reply ? (
        inquiry.status === "booked" ? (
          <Button
            label="See your booking"
            variant="secondary"
            onPress={() => (inquiry.bookingId ? router.push(`/owner/bookings/${inquiry.bookingId}`) : router.push("/owner/bookings"))}
            testID="inquiry-see-booking"
          />
        ) : canHost ? (
          <Button
            label="Request booking"
            onPress={() => router.push(`/owner/bookings/new?inquiry=${inquiry.id}`)}
            testID="inquiry-request-booking"
          />
        ) : (
          <Button
            label="Find other sitters"
            onPress={() => router.push(`/owner/bookings/new?inquiry=${inquiry.id}&other=1`)}
            testID="inquiry-find-others"
          />
        )
      ) : null}
    </Screen>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    content: { gap: theme.spacing.md },
    trip: { gap: theme.spacing.xs },
    tripTitle: { fontSize: theme.fontSize.body, fontWeight: "700", color: theme.color.text },
    muted: { fontSize: theme.fontSize.small, color: theme.color.textMuted },
    sources: { flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.xs },
    waiting: { gap: 2, padding: theme.spacing.sm },
    typing: { fontSize: theme.fontSize.small, fontStyle: "italic", color: theme.color.textMuted },
  });
