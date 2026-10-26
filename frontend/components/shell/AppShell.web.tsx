import { ReactNode, useEffect, useState } from "react";
import { View, useWindowDimensions } from "react-native";

import { tokens } from "../../theme/tokens";
import { DeviceFrame, FrameLink } from "./DeviceFrame.web";
import {
  SPLIT_MIN_WIDTH,
  TOUCH_PRIMARY_QUERY,
  readFrameOverride,
  readSplitRequest,
  resolvePresentation,
} from "./presentation";
import { FrameAccount, accountLabel, isAccountMessage } from "./accountMessage";
import { isDemoToolsBuild } from "../../lib/demo";
import { JUDGE_PANEL_WIDTH, JudgePanel } from "./JudgePanel.web";
import { JUDGE_SIGN_IN, JudgeSignInMessage, isJudgeSeatMessage, otherRole, paneWindow } from "./judgeMessages";

/** Below this window width the judge panel would squeeze the phones; it hides (the seats still work). */
const PANEL_MIN_WIDTH = 1100;
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

/** Who is signed in inside each phone, by the iframe's name, as the app tells us. */
function useFrameAccounts(): Record<string, FrameAccount> {
  const [accounts, setAccounts] = useState<Record<string, FrameAccount>>({});

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || !isAccountMessage(event.data)) return;
      const { pane, account } = event.data;
      setAccounts((current) => ({ ...current, [pane]: account }));
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  return accounts;
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
  const accounts = useFrameAccounts();
  const { width: windowWidth } = useWindowDimensions();
  // Read once: while the window is too narrow the one-phone frame mirrors its own URL into the address bar,
  // and widening again must still bring both phones back.
  const [splitRequested] = useState(() => canUseDOM && readSplitRequest(window.location.search));
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

  // The judge panel (#413) sits left of the phones on a wide computer window: always in the judging build, and in the
  // team build only while a phone is signed in to a judge set. The phones keep their place in the tree either way, so
  // the panel appearing never reloads them.
  const showPanel =
    presentation !== "direct" &&
    windowWidth >= PANEL_MIN_WIDTH &&
    (!isDemoToolsBuild || Object.values(accounts).some((account) => account?.judge));
  const reserve = showPanel ? JUDGE_PANEL_WIDTH : 0;

  if (presentation === "split") {
    return (
      <View style={{ flex: 1, flexDirection: "row" }} testID="split-view">
        {showPanel ? <JudgePanel key="panel" panes={["pane-left", "pane-right"]} accounts={accounts} /> : null}
        {(["left", "right"] as const).map((side) => (
          <View key={side} style={{ flex: 1 }}>
            <DeviceFrame
              columns={2}
              reserve={reserve}
              label={accountLabel(accounts[`pane-${side}`])}
              // Both phones keep the same height; the link sits under the left one.
              footer={side === "left" ? <FrameLink label="Show one phone" href="/" testID="show-one-phone" /> : <View />}
            >
              <AppFrame src="/login" name={`pane-${side}`} title={`Goldito app (${side} phone)`} />
            </DeviceFrame>
          </View>
        ))}
      </View>
    );
  }

  if (presentation === "framed") {
    return (
      <View style={{ flex: 1, flexDirection: "row" }}>
        {showPanel ? <JudgePanel key="panel" panes={[""]} accounts={accounts} /> : null}
        <View key="phone" style={{ flex: 1 }}>
          <DeviceFrame
            reserve={reserve}
            label={accountLabel(accounts[""])}
            footer={
              windowWidth >= SPLIT_MIN_WIDTH && !touchPrimary ? (
                <FrameLink label="Show both phones" href="/?view=split" testID="show-both-phones" />
              ) : undefined
            }
          >
            <AppFrame />
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
