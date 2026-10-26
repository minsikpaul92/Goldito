import { StyleSheet, Text, View } from "react-native";

import { ChatCard } from "../features/chat/chatApi";
import { formatInstant, formatStamp } from "../features/schedule/dates";
import { useThemedStyles } from "../providers/ThemeProvider";
import { Theme } from "../theme/themes";

type Update = Extract<ChatCard, { type: "meet_greet_update" }>;

/** "Daniel accepted the Meet & Greet": what changed, in the words of the one who reads it ("You" for my own change). */
export function meetGreetUpdateText(card: Update, who: string): string {
  switch (card.event) {
    case "proposed":
      return who === "You" ? "You sent a Meet & Greet Request" : `${who} sent a Meet & Greet Request`;
    case "agreed":
      return `${who} accepted the Meet & Greet`;
    case "time_declined":
      return `${who} can't make that time`;
    case "skip_requested":
      return `${who} asked to skip the Meet & Greet`;
    case "skipped":
      return `${who} agreed to skip the Meet & Greet`;
    case "done":
      return "Meet & Greet done";
    case "declined":
      return `${who} declined the request`;
  }
}

/**
 * A Meet & Greet change as a short line at the bottom of the chat (015k, #264), so an answer is a new message and not only
 * a change in the card higher up. The card stays as the record; this line keeps the time and place as they were then.
 */
export function ChatMeetGreetUpdate({ card, mine, otherName, at }: { card: Update; mine: boolean; otherName: string; at: string }) {
  const styles = useThemedStyles(makeStyles);
  const plan =
    (card.event === "proposed" || card.event === "agreed") && card.at
      ? card.mode === "video"
        ? `Online · ${formatInstant(card.at)}`
        : `In person${card.place ? ` · ${card.place}` : ""} · ${formatInstant(card.at)}`
      : null;
  // "Done" is both people's: a system line in the middle.
  const shared = card.event === "done";
  mine = mine && !shared;
  return (
    <View style={[styles.row, shared ? styles.rowShared : mine ? styles.rowMe : styles.rowThem]} testID="chat-mg-update">
      <View style={[styles.pill, shared ? styles.pillShared : mine ? styles.pillMe : styles.pillThem]}>
        <Text style={[styles.title, mine && styles.onGreen, shared && styles.centered]}>{meetGreetUpdateText(card, mine ? "You" : otherName)}</Text>
        {plan ? <Text style={[styles.line, mine && styles.onGreen]}>{plan}</Text> : null}
        <Text style={[styles.stamp, mine && styles.onGreen, shared && styles.centered]}>{formatStamp(at)}</Text>
      </View>
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    // A person's own step: mine green on the right, theirs white on the left, like the bubbles.
    row: {},
    rowMe: { alignItems: "flex-end" },
    rowThem: { alignItems: "flex-start" },
    rowShared: { alignItems: "center" },
    pillShared: { backgroundColor: theme.color.blockBlush, alignItems: "center" },
    centered: { textAlign: "center" },
    pillMe: { backgroundColor: theme.color.primary },
    pillThem: { backgroundColor: theme.color.surface, borderWidth: 1, borderColor: theme.color.border },
    onGreen: { color: theme.color.primaryText },
    pill: {
      maxWidth: "88%",
      alignItems: "flex-start",
      gap: 2,
      paddingVertical: theme.spacing.sm,
      paddingHorizontal: theme.spacing.md,
      borderRadius: theme.radius.lg,
    },
    title: { fontSize: theme.fontSize.body, color: theme.color.text, },
    line: { fontSize: theme.fontSize.body, color: theme.color.text },
    stamp: { fontSize: theme.fontSize.caption, color: theme.color.textMuted },
  });
