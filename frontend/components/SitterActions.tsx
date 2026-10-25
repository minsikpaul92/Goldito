import { router } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { Button } from "./ui/Button";
import { Stay, openChatThread, sendFirstHello } from "../features/chat/chatApi";
import { SitterProfileView } from "../features/sitters/sitterApi";
import { useErrorDialog } from "../providers/ErrorDialogProvider";
import { useSession } from "../providers/SessionProvider";
import { useThemedStyles } from "../providers/ThemeProvider";
import { Theme } from "../theme/themes";

type Props = {
  sitter: SitterProfileView;
  /** The stay from the search (or the day being looked at): it becomes the first card of the chat. */
  stay?: Stay;
};

/** Start chat, pinned under a sitter's profile, schedule and day pages: questions and booking both happen in the chat. */
export function SitterActions({ sitter, stay }: Props) {
  const styles = useThemedStyles(makeStyles);
  const errorDialog = useErrorDialog();
  const { profile } = useSession();
  const [opening, setOpening] = useState(false);

  const start = async () => {
    if (opening) return;
    setOpening(true);
    try {
      const threadId = await openChatThread(sitter.id, stay);
      // The owner's hello goes with the first card, so nobody has to press a greeting chip to start.
      if (profile?.role === "owner") await sendFirstHello(threadId, sitter.displayName, profile.id, profile.displayName);
      router.push(`/chat/${threadId}`);
    } catch (e) {
      errorDialog.show({ title: "Couldn't open the chat", message: (e as Error).message, onRetry: () => void start() });
    } finally {
      setOpening(false);
    }
  };

  return (
    <View style={styles.footer}>
      <Button label={opening ? "Opening…" : "Start chat"} onPress={() => void start()} disabled={opening} testID="start-chat" />
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    footer: { padding: theme.spacing.md, maxWidth: 480, width: "100%", alignSelf: "center" },
  });
