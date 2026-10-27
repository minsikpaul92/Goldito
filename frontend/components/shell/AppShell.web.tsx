import { ReactNode, useEffect, useState } from "react";
import { View, useWindowDimensions } from "react-native";

import { tokens } from "../../theme/tokens";
import { DeviceFrame, FrameLink } from "./DeviceFrame.web";
import {
  SPLIT_MIN_WIDTH,
  TOUCH_PRIMARY_QUERY,
  readFrameOverride,
  clearJudgeStart,
  readJudgeStart,
  readSplitRequest,
  resolvePresentation,
} from "./presentation";
import { FrameAccount, accountLabel, isAccountMessage } from "./accountMessage";
import { JUDGE_PANEL_WIDTH, JudgePanel } from "./JudgePanel.web";
import { JUDGE_SIGN_IN, JudgeSignInMessage, isJudgeSeatMessage, otherRole, paneWindow } from "./judgeMessages";
import { installTouchEmulation } from "./TouchEmulation.web";
import { ShellContext } from "./useShell";

type Props = {
  children: ReactNode;
};

const canUseDOM = typeof window !== "undefined";

function isEmbedded(): boolean {
  if (!canUseDOM) return false;
  try {
    return window.self !== window.top;
  } catch {
    // Accessing a cross-origin top throws — we are inside someone's iframe.
    return true;
  }
}

function currentUrl(): string {
  const { pathname, search, hash } = window.location;
  return `${pathname}${search}${hash}`;
}

function useTouchPrimary(): boolean {
  const [touchPrimary, setTouchPrimary] = useState(
    () => canUseDOM && window.matchMedia(TOUCH_PRIMARY_QUERY).matches,
  );

  useEffect(() => {
    const query = window.matchMedia(TOUCH_PRIMARY_QUERY);
    const onChange = () => setTouchPrimary(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  return touchPrimary;
}

/**
 * Who is signed in inside each phone, by the iframe's name, as the app tells us; `out` marks the phones that are signed
 * out (not just loading).
 */
function useFrameAccounts(): { accounts: Record<string, FrameAccount>; out: Record<string, boolean> } {
  const [accounts, setAccounts] = useState<Record<string, FrameAccount>>({});
  const [out, setOut] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || !isAccountMessage(event.data)) return;
      const { pane, account, signedOut } = event.data;
      setAccounts((current) => ({ ...current, [pane]: account }));
      setOut((current) => ({ ...current, [pane]: Boolean(signedOut) }));
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  return { accounts, out };
}

/**
 * Web entry for the app (architecture D25).
 * - Computer (mouse / trackpad), any window width → phone frame with the same app in a same-origin iframe.
 * - Phone / tablet browser, `?frame=0`, or inside that iframe → the app as-is.
 * - Computer, `?view=split`, window ≥ 900 px → two phones side by side, each with its own session (10.10; the
 *   judges' link). Each one starts at the login screen; the account that signs in is named above the phone.
 */
export function AppShell({ children }: Props) {
  const [embedded] = useState(isEmbedded);
  const touchPrimary = useTouchPrimary();
  const { accounts, out } = useFrameAccounts();
  // The judge panel is resetting the stay: both phones show the paw walk.
  const [settingUp, setSettingUp] = useState(false);
  const { width: windowWidth } = useWindowDimensions();
  // Read once: while the window is too narrow the one-phone frame mirrors its own URL into the address bar,
  // and widening again must still bring both phones back.
  const [splitRequested] = useState(() => canUseDOM && readSplitRequest(window.location.search));
  // Try the demo took this Judge seat (#411): each phone signs in to its account of the set, once.
  const [judgeStart] = useState(() => (canUseDOM && !embedded ? readJudgeStart() : null));
  useEffect(() => {
    if (judgeStart) clearJudgeStart();
  }, [judgeStart]);
  const paneStart = (role: "owner" | "sitter") => (judgeStart ? `/login?demo=${role}&set=${judgeStart}` : "/login");
  const presentation = resolvePresentation({
    embedded,
    touchPrimary,
    override: canUseDOM ? readFrameOverride(window.location.search) : null,
    split: splitRequested,
    windowWidth,
  });

  // Inside the frame, the mouse acts like a finger (task 1.7).
  useEffect(() => (embedded ? installTouchEmulation() : undefined), [embedded]);

  // Back in split view, the address bar shows the split link again (a reload keeps both phones).
  useEffect(() => {
    if (presentation === "split") window.history.replaceState(window.history.state, "", "/?view=split");
  }, [presentation]);

  // Split view: the phone that took a Judge seat has the other phone sign in to the set's other account (#411).
  useEffect(() => {
    if (presentation !== "split") return;
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || !isJudgeSeatMessage(event.data)) return;
      const other = event.data.pane === "pane-left" ? "pane-right" : "pane-left";
      const message: JudgeSignInMessage = { type: JUDGE_SIGN_IN, set: event.data.set, role: otherRole(event.data.role) };
      paneWindow(other)?.postMessage(message, window.location.origin);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [presentation]);

  // The judge panel (#413) sits left of the phones on a computer while a phone is signed in to a judge set, at any
  // window width (the phones shrink instead). Log out takes it away. The phones keep their place in the tree either
  // way, so the panel appearing never reloads them.
  const panes = presentation === "split" ? ["pane-left", "pane-right"] : [""];
  const judgeHere = useJudgeHere(accounts, out, panes);
  const showPanel = presentation !== "direct" && judgeHere;
  const reserve = showPanel ? JUDGE_PANEL_WIDTH : 0;
  const loading = showPanel && settingUp;

  if (presentation === "split") {
    return (
      <View style={{ flex: 1, flexDirection: "row" }} testID="split-view">
        {showPanel ? <JudgePanel key="panel" panes={panes} accounts={accounts} onSettingUp={setSettingUp} /> : null}
        {(["left", "right"] as const).map((side) => (
          // The two phones sit side by side in the middle, a small gap apart.
          <View key={side} style={{ flex: 1 }}>
            <DeviceFrame
              columns={2}
              reserve={reserve}
              hug={side === "left" ? "right" : "left"}
              loading={loading}
              label={accountLabel(accounts[`pane-${side}`])}
              // Both phones keep the same height; the link sits under the left one.
              footer={side === "left" ? <FrameLink label="Show one phone" href="/" testID="show-one-phone" /> : <View />}
            >
              <AppFrame
                src={paneStart(side === "left" ? "owner" : "sitter")}
                name={`pane-${side}`}
                title={`Goldito app (${side} phone)`}
              />
            </DeviceFrame>
          </View>
        ))}
      </View>
    );
  }

  if (presentation === "framed") {
    return (
      <View style={{ flex: 1, flexDirection: "row" }}>
        {showPanel ? <JudgePanel key="panel" panes={panes} accounts={accounts} onSettingUp={setSettingUp} /> : null}
        <View key="phone" style={{ flex: 1 }}>
          <DeviceFrame
            reserve={reserve}
            loading={loading}
            label={accountLabel(accounts[""])}
            footer={
              windowWidth >= SPLIT_MIN_WIDTH && !touchPrimary ? (
                <FrameLink label="Show both phones" href="/?view=split" testID="show-both-phones" />
              ) : undefined
            }
          >
            <AppFrame src={judgeStart ? paneStart("owner") : undefined} />
          </DeviceFrame>
        </View>
      </View>
    );
  }

  return (
    <ShellContext.Provider value={{ embedded }}>
      {embedded && !isSplitPane() ? <ParentUrlSync /> : null}
      {children}
    </ShellContext.Provider>
  );
}

/**
 * A phone here is signed in to a judge set (#413). A phone that reloads (a scene opening) reports no account for a
 * moment; that keeps the answer, so the panel and its scene stay. A team account signing in, or every phone signed
 * out for a moment (log out, not a phone switching account for a scene), turns it off.
 */
function useJudgeHere(accounts: Record<string, FrameAccount>, out: Record<string, boolean>, panes: string[]): boolean {
  const [here, setHere] = useState(false);
  const values = panes.map((pane) => accounts[pane]);
  const judge = values.some((account) => account?.judge);
  const team = values.some((account) => account && !account.judge);
  const allOut = panes.every((pane) => out[pane]);
  useEffect(() => {
    if (judge) setHere(true);
    else if (team) setHere(false);
    else if (allOut) {
      const timer = setTimeout(() => setHere(false), SIGNED_OUT_MS);
      return () => clearTimeout(timer);
    }
  }, [judge, team, allOut]);
  return judge || (here && !team);
}

/** How long every phone stays signed out before the judge panel goes (a scene switching account takes less). */
const SIGNED_OUT_MS = 2_000;

/** Inside a split-view phone (named by the outer page): two phones must not fight over the address bar. */
function isSplitPane(): boolean {
  return canUseDOM && window.name.startsWith("pane-");
}

/** The app itself, loaded at the outer page's current URL (or a split pane's own start page). */
function AppFrame({ src: start, name, title = "Goldito app" }: { src?: string; name?: string; title?: string }) {
  // Set once: later route changes happen inside the iframe and are mirrored outward.
  const [src] = useState(() => start ?? currentUrl());

  return (
    <iframe
      src={src}
      name={name}
      title={title}
      allow="camera; microphone"
      style={{
        border: 0,
        display: "block",
        width: "100%",
        height: "100%",
        backgroundColor: tokens.color.background,
      }}
    />
  );
}

/**
 * Mirrors the iframe's URL into the outer address bar so refresh, shared links,
 * and the back button keep the current screen.
 */
function ParentUrlSync() {
  useEffect(() => {
    const sync = () => {
      try {
        window.parent.history.replaceState(window.parent.history.state, "", currentUrl());
      } catch {
        // Parent is another origin — nothing to mirror.
      }
    };

    const { history } = window;
    const originalPush = history.pushState;
    const originalReplace = history.replaceState;
    history.pushState = function (...args: Parameters<History["pushState"]>) {
      originalPush.apply(history, args);
      sync();
    };
    history.replaceState = function (...args: Parameters<History["replaceState"]>) {
      originalReplace.apply(history, args);
      sync();
    };
    window.addEventListener("popstate", sync);
    sync();

    return () => {
      history.pushState = originalPush;
      history.replaceState = originalReplace;
      window.removeEventListener("popstate", sync);
    };
  }, []);

  return null;
}
