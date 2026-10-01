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
    await getSupabase().auth.signOut();
  }, []);

  const value = useMemo<SessionValue>(
    () => ({ ...state, reload, patchProfile, signOut }),
    [state, reload, patchProfile, signOut],
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
