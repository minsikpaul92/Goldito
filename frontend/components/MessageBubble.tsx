import { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

import { useThemedStyles } from "../providers/ThemeProvider";
import { Theme } from "../theme/themes";

type Props = {
  /** `me` = the viewer's own message (right), `them` = the other person (left). */
  side: "me" | "them";
  body: string;
  meta?: string;
  children?: ReactNode;
  testID?: string;
};

/** A chat bubble. No author label beyond the side: the owner sees the sitter's reply as the sitter's (D35). */
export function MessageBubble({ side, body, meta, children, testID }: Props) {
  const styles = useThemedStyles(makeStyles);
  const mine = side === "me";
  return (
    <View style={[styles.row, mine ? styles.rowMe : styles.rowThem]} testID={testID}>
      <View style={[styles.bubble, mine ? styles.bubbleMe : styles.bubbleThem]}>
        <Text style={[styles.body, mine && styles.bodyMe]}>{body}</Text>
        {children}
      </View>
      {meta ? <Text style={styles.meta}>{meta}</Text> : null}
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    row: { gap: 2, maxWidth: "88%" },
    rowMe: { alignSelf: "flex-end", alignItems: "flex-end" },
    rowThem: { alignSelf: "flex-start", alignItems: "flex-start" },
    bubble: { padding: theme.spacing.sm, borderRadius: theme.radius.lg, gap: theme.spacing.xs },
    bubbleMe: { backgroundColor: theme.color.primary },
    bubbleThem: { backgroundColor: theme.color.surface, borderWidth: 1, borderColor: theme.color.border },
    body: { fontSize: theme.fontSize.body, color: theme.color.text },
    bodyMe: { color: theme.color.primaryText },
    meta: { fontSize: theme.fontSize.small, color: theme.color.textMuted },
  });
