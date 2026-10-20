import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";

import { ChatListItem, leaveChat, listMyChats } from "./chatApi";
import { useLiveChat } from "./useLiveChat";

/** The signed-in person's chats, kept current while the screen is on (Realtime + poll) and reloaded on focus. */
export function useMyChats() {
  const [items, setItems] = useState<ChatListItem[]>([]);
  const [loaded, setLoaded] = useState(false);

  const reload = useCallback(async () => {
    try {
      setItems(await listMyChats());
    } catch {
      // keep what is on screen; the next refresh tries again
    } finally {
      setLoaded(true);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );
  useLiveChat(undefined, reload);

  const leave = async (threadId: string) => {
    setItems((list) => list.filter((c) => c.threadId !== threadId));
    try {
      await leaveChat(threadId);
    } finally {
      void reload();
    }
  };

  const unread = items.reduce((n, c) => n + c.unread, 0);
  return { items, loaded, unread, reload, leave };
}
