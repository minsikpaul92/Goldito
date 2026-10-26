import { Session } from "@supabase/supabase-js";
import {
  ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { HEARTBEAT_MS, heartbeat, judgeSetFor, onSeatReleased, releaseSeat, takeSeat } from "../lib/judgeSeat";
import { getSupabase, isSupabaseConfigured } from "../lib/supabase";

export type Role = "owner" | "sitter";

export type Profile = {
  id: string;
  role: Role;
  displayName: string;
};

type SessionState =
  | { status: "loading"; session: Session | null; profile: null; error: null }
  | { status: "signedOut"; session: null; profile: null; error: null }
  | { status: "signedIn"; session: Session; profile: Profile; error: null }
  | { status: "error"; session: Session; profile: null; error: string };

type SessionValue = SessionState & {
  /** Load the profile again after an error. */
  reload: () => void;
  /** Reflect a saved `profiles` change (e.g. display name) without refetching. */
  patchProfile: (changes: Pick<Profile, "displayName">) => void;
  signOut: () => Promise<void>;
  /** Why a Judge seat signed this browser out (#411), shown on the login screen. */
  seatNotice: string | null;
};

const LOADING: SessionState = { status: "loading", session: null, profile: null, error: null };
const SIGNED_OUT: SessionState = { status: "signedOut", session: null, profile: null, error: null };

const SessionContext = createContext<SessionValue | null>(null);

function isRole(value: unknown): value is Role {
  return value === "owner" || value === "sitter";
}

/** Supabase session + `profiles` row (role, display name) for routing (phase-03 3.3). */
export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>(isSupabaseConfigured ? LOADING : SIGNED_OUT);
  const profileUserId = useRef<string | null>(null);
  const [seatNotice, setSeatNotice] = useState<string | null>(null);

  const load = useCallback(async (session: Session | null) => {
    if (!session) {
      profileUserId.current = null;
      setState(SIGNED_OUT);
      return;
    }
    if (profileUserId.current === session.user.id) {
      // Same user (e.g. token refresh): keep the profile, swap the session.
      setState((prev) => (prev.status === "signedIn" ? { ...prev, session } : prev));
      return;
    }

    setState({ status: "loading", session, profile: null, error: null });
    const { data, error } = await getSupabase()
      .from("profiles")
      .select("id, role, display_name")
      .eq("id", session.user.id)
      .single();

    if (error || !data || !isRole(data.role)) {
      profileUserId.current = null;
      setState({ status: "error", session, profile: null, error: "We couldn't load your profile." });
      return;
    }
    profileUserId.current = data.id;
    setState({
      status: "signedIn",
      session,
      profile: { id: data.id, role: data.role, displayName: data.display_name },
      error: null,
    });
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    const supabase = getSupabase();
    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (active) void load(data.session);
    });

    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "INITIAL_SESSION") return; // handled by getSession above
      // Supabase calls must not run inside this callback (auth lock) — defer them.
      setTimeout(() => {
        if (active) void load(session);
      }, 0);
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [load]);

  // A phone frame around the app names the signed-in account above the phone.
  useEffect(() => {
    if (typeof window === "undefined" || window.parent === window) return;
    const account =
      state.status === "signedIn"
        ? {
            name: state.profile.displayName,
            role: state.profile.role,
            judge: judgeSetFor(state.session.user.email)?.key ?? null,
          }
        : null;
    try {
      window.parent.postMessage({ type: "goldito:account", pane: window.name, account }, window.location.origin);
    } catch {
      // The page around us is not ours.
    }
  }, [state]);

  const reload = useCallback(() => {
    profileUserId.current = null;
    if (state.session) void load(state.session);
  }, [load, state.session]);

  const patchProfile = useCallback((changes: Pick<Profile, "displayName">) => {
    setState((prev) =>
      prev.status === "signedIn" ? { ...prev, profile: { ...prev.profile, ...changes } } : prev,
    );
  }, []);

  const signOut = useCallback(async () => {
    if (!isSupabaseConfigured) return;
    const supabase = getSupabase();
    // Signing out of a judge set frees its seat at once (#411); the other phone of the split view signs out with it.
    const judge = judgeSetFor((await supabase.auth.getSession()).data.session?.user.email);
    if (judge) await releaseSeat(judge.key);
    await supabase.auth.signOut();
  }, []);

  // A judge set is held by this browser while it is signed in (#411): a heartbeat about every minute keeps the seat.
  // Signed in by hand (no seat yet), it takes the seat first. A seat that went to another judge signs out.
  const email = state.status === "signedIn" ? state.session.user.email : null;
  useEffect(() => {
    const judge = judgeSetFor(email);
    if (!judge) return;
    let active = true;
    const beat = async () => {
      if (await heartbeat(judge.key)) return;
      try {
        await takeSeat(judge.key);
      } catch {
        if (!active) return;
        setSeatNotice(`${judge.label} is in use. Pick another seat.`);
        void signOut();
      }
    };
    setSeatNotice(null);
    void beat();
    const timer = setInterval(beat, HEARTBEAT_MS);
    const off = onSeatReleased((set) => {
      if (set === judge.key && active) void getSupabase().auth.signOut();
    });
    return () => {
      active = false;
      clearInterval(timer);
      off();
    };
  }, [email, signOut]);

  const value = useMemo<SessionValue>(
    () => ({ ...state, reload, patchProfile, signOut, seatNotice }),
    [state, reload, patchProfile, signOut, seatNotice],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error("useSession must be used inside SessionProvider");
  return value;
}

/** Where a signed-in user's app starts. */
export function homeFor(role: Role): "/owner" | "/sitter" {
  return role === "owner" ? "/owner" : "/sitter";
}
