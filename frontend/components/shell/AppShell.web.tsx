import { ReactNode, useEffect, useState } from "react";
import { View, useWindowDimensions } from "react-native";

import { DEMO_ACCOUNTS } from "../../lib/demo";
import { tokens } from "../../theme/tokens";
import { DeviceFrame, FrameLink } from "./DeviceFrame.web";
import {
  SPLIT_MIN_WIDTH,
  TOUCH_PRIMARY_QUERY,
  readFrameOverride,
  readSplitRequest,
  resolvePresentation,
} from "./presentation";
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
 * Web entry for the app (architecture D25).
 * - Computer (mouse / trackpad), any window width → phone frame with the same app in a same-origin iframe.
 * - Phone / tablet browser, `?frame=0`, or inside that iframe → the app as-is.
 * - Computer, `?view=split`, window ≥ 900 px → owner and sitter phones side by side, each signed in
 *   to its own demo account (10.10; the judges' link).
 */
export function AppShell({ children }: Props) {
  const [embedded] = useState(isEmbedded);
  const touchPrimary = useTouchPrimary();
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

  if (presentation === "split") {
    return (
      <View style={{ flex: 1, flexDirection: "row" }} testID="split-view">
        {(["owner", "sitter"] as const).map((role) => (
          <View key={role} style={{ flex: 1 }}>
            <DeviceFrame
              columns={2}
              label={`${role === "owner" ? "Owner" : "Sitter"} · ${DEMO_ACCOUNTS[role].name}`}
              // Both phones keep the same height; the link sits under the owner's.
              footer={role === "owner" ? <FrameLink label="Show one phone" href="/" testID="show-one-phone" /> : <View />}
            >
              <AppFrame
                src={`/login?demo=${role}`}
                name={`pane-${role}`}
                title={`Goldito app — ${role === "owner" ? "Owner" : "Sitter"}`}
              />
            </DeviceFrame>
          </View>
        ))}
      </View>
    );
  }

  if (presentation === "framed") {
    return (
      <DeviceFrame
        footer={
          windowWidth >= SPLIT_MIN_WIDTH && !touchPrimary ? (
            <FrameLink label="Show both phones" href="/?view=split" testID="show-both-phones" />
          ) : undefined
        }
      >
        <AppFrame />
      </DeviceFrame>
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
