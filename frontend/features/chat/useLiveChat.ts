import { useEffect } from "react";

import { getSupabase } from "../../lib/supabase";

const POLL_MS = 5000;

/**
 * Keeps a chat (or, with no thread, the chat list) current: a new message row refreshes it at once (Realtime,
 * RLS-scoped) and a slow poll covers a missed event or a dropped socket, the same pair the inquiry thread uses.
 */
export function useLiveChat(threadId: string | undefined, reload: () => unknown): void {
  useEffect(() => {
    const supabase = getSupabase();
    const channel = supabase
      .channel(`chat:${threadId ?? "list"}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages", ...(threadId ? { filter: `thread_id=eq.${threadId}` } : {}) },
        () => reload(),
      )
      .subscribe();
    const poll = setInterval(reload, POLL_MS);
    return () => {
      clearInterval(poll);
      void supabase.removeChannel(channel);
    };
  }, [threadId, reload]);
}
