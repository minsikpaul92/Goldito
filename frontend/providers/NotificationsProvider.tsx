import {
  ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { DIARY_NOTIFICATION_TYPES, countUnreadNotifications } from "../lib/notifications";
import { getSupabase, isSupabaseConfigured } from "../lib/supabase";
import type { NotificationRow } from "../types/db";
import { useSession } from "./SessionProvider";
import { useToast } from "./ToastProvider";

type NotificationsValue = {
  /** Unread notifications for the signed-in user (header badge). */
  unreadCount: number;
  /** Bumps on `feed_post` — Owner Feed refetches without a full remount. */
  feedRevision: number;
  /** Bumps on Diary-related types — Live/history can subscribe (stub until 06–07). */
  diaryRevision: number;
  /** Bumps on any INSERT — notification center soft-refetches while open. */
  inboxRevision: number;
  /** Re-query unread (e.g. after marking read in 5.5). */
  refreshUnread: () => Promise<void>;
};

const NotificationsContext = createContext<NotificationsValue | null>(null);

/**
 * Realtime for the signed-in user (phase-05 5.4–5.5 · 5.7):
 * - `notifications` INSERT → toast + unread + type revisions
 * - `feed_posts` DELETE → feedRevision (owner album drops deleted photos live)
 */
export function NotificationsProvider({ children }: { children: ReactNode }) {
  const session = useSession();
  const toast = useToast();
  const userId = session.status === "signedIn" ? session.profile.id : null;

  const [unreadCount, setUnreadCount] = useState(0);
  const [feedRevision, setFeedRevision] = useState(0);
  const [diaryRevision, setDiaryRevision] = useState(0);
  const [inboxRevision, setInboxRevision] = useState(0);

  const refreshUnread = useCallback(async () => {
    if (!userId || !isSupabaseConfigured) {
      setUnreadCount(0);
      return;
    }
    try {
      setUnreadCount(await countUnreadNotifications());
    } catch {
      // Don't block the app if the count query fails (e.g. offline).
    }
  }, [userId]);

  useEffect(() => {
    if (!userId || !isSupabaseConfigured) {
      setUnreadCount(0);
      return;
    }

    let active = true;
    void refreshUnread();

    const supabase = getSupabase();
    const channel = supabase
      .channel(`notifications:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          if (!active) return;
          const row = payload.new as NotificationRow;
          setUnreadCount((n) => n + 1);
          setInboxRevision((r) => r + 1);
          if (row.title) toast.show(row.title);
          if (row.type === "feed_post") {
            setFeedRevision((r) => r + 1);
            setDiaryRevision((r) => r + 1);
          } else if (DIARY_NOTIFICATION_TYPES.has(row.type)) {
            setDiaryRevision((r) => r + 1);
          }
        },
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "feed_posts",
        },
        () => {
          // RLS limits events to pets the viewer can access (can_access_pet).
          if (!active) return;
          setFeedRevision((r) => r + 1);
        },
      )
      .subscribe();

    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [userId, refreshUnread, toast]);

  const value = useMemo<NotificationsValue>(
    () => ({ unreadCount, feedRevision, diaryRevision, inboxRevision, refreshUnread }),
    [unreadCount, feedRevision, diaryRevision, inboxRevision, refreshUnread],
  );

  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}

export function useNotifications(): NotificationsValue {
  const value = useContext(NotificationsContext);
  if (!value) throw new Error("useNotifications must be used inside NotificationsProvider");
  return value;
}
