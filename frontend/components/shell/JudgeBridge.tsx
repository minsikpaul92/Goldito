import { router } from "expo-router";
import { useEffect } from "react";

import { DEMO_PASSWORD, demoSetFor } from "../../lib/demo";
import { getSupabase, isSupabaseConfigured } from "../../lib/supabase";
import { isJudgeSignInMessage } from "./judgeMessages";

/**
 * Inside a phone frame: the page around it can sign this phone in to the other account of the judge set the other
 * phone just took (#411, split view). Renders nothing; does nothing outside a frame.
 */
export function JudgeBridge() {
  useEffect(() => {
    if (typeof window === "undefined" || window.parent === window || !isSupabaseConfigured) return;
    const onMessage = async (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== window.parent) return;
      if (!isJudgeSignInMessage(event.data)) return;
      const set = demoSetFor(event.data.set);
      if (!set.judge) return;
      const email = set[event.data.role].email;
      const supabase = getSupabase();
      const current = (await supabase.auth.getSession()).data.session?.user.email;
      if (current?.toLowerCase() === email) return;
      // Not signOut() from the session: the seat stays held, only this phone changes account.
      if (current) await supabase.auth.signOut({ scope: "local" });
      const { error } = await supabase.auth.signInWithPassword({ email, password: DEMO_PASSWORD });
      if (!error) router.replace("/");
    };
    const listener = (event: MessageEvent) => void onMessage(event);
    window.addEventListener("message", listener);
    return () => window.removeEventListener("message", listener);
  }, []);

  return null;
}
