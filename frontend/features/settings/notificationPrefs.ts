import { useCallback, useEffect, useState } from "react";

import { getSupabase } from "../../lib/supabase";
import { useSession } from "../../providers/SessionProvider";
import { useToast } from "../../providers/ToastProvider";

/** Settings → Notifications (015e): the three families a person can turn off. Everything else is always delivered. */
export type NotificationPrefs = { trip: boolean; daily: boolean; tips: boolean };
export type NotificationPrefKey = keyof NotificationPrefs;

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = { trip: true, daily: true, tips: false };

async function loadPrefs(userId: string): Promise<NotificationPrefs> {
  const { data, error } = await getSupabase().from("profiles").select("notification_prefs").eq("id", userId).maybeSingle();
  if (error || !data) return DEFAULT_NOTIFICATION_PREFS;
  const saved = (data.notification_prefs ?? {}) as Partial<NotificationPrefs>;
  return {
    trip: saved.trip ?? DEFAULT_NOTIFICATION_PREFS.trip,
    daily: saved.daily ?? DEFAULT_NOTIFICATION_PREFS.daily,
    tips: saved.tips ?? DEFAULT_NOTIFICATION_PREFS.tips,
  };
}

/** The signed-in person's switches. A change shows at once and is saved right away; a failed save puts it back. */
export function useNotificationPrefs() {
  const { profile } = useSession();
  const toast = useToast();
  const userId = profile?.id;
  const [prefs, setPrefs] = useState<NotificationPrefs>(DEFAULT_NOTIFICATION_PREFS);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    void loadPrefs(userId).then((loaded) => {
      if (active) setPrefs(loaded);
    });
    return () => {
      active = false;
    };
  }, [userId]);

  const setPref = useCallback(
    async (key: NotificationPrefKey, on: boolean) => {
      setPrefs((cur) => ({ ...cur, [key]: on }));
      const { error } = await getSupabase().rpc("set_notification_pref", { p_key: key, p_on: on });
      if (error) {
        setPrefs((cur) => ({ ...cur, [key]: !on }));
        toast.show("Couldn't save that. Try again.");
      }
    },
    [toast],
  );

  return { prefs, setPref };
}
