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
      return `${who} suggested a Meet & Greet`;
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
        ? `Video · ${formatInstant(card.at)}`
        : `In person${card.place ? ` · ${card.place}` : ""} · ${formatInstant(card.at)}`
      : null;
  return (
    <View style={styles.row} testID="chat-mg-update">
      <View style={styles.pill}>
        <Text style={styles.title}>{meetGreetUpdateText(card, mine ? "You" : otherName)}</Text>
        {plan ? <Text style={styles.line}>{plan}</Text> : null}
        <Text style={styles.stamp}>{formatStamp(at)}</Text>
      </View>
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    row: { alignItems: "center" },
    pill: {
      maxWidth: "88%",
      alignItems: "center",
      gap: 2,
      paddingVertical: theme.spacing.sm,
      paddingHorizontal: theme.spacing.md,
      borderRadius: theme.radius.lg,
      backgroundColor: theme.color.blockBlush,
    },
    title: { fontSize: theme.fontSize.body, color: theme.color.text, textAlign: "center" },
    line: { fontSize: theme.fontSize.body, color: theme.color.text, textAlign: "center" },
    stamp: { fontSize: theme.fontSize.caption, color: theme.color.textMuted },
  });
