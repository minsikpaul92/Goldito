import { ReactNode, useEffect, useState } from "react";

import { tokens } from "../../theme/tokens";
import { DeviceFrame } from "./DeviceFrame.web";
import { TOUCH_PRIMARY_QUERY, readFrameOverride, resolvePresentation } from "./presentation";
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
 */
export function AppShell({ children }: Props) {
  const [embedded] = useState(isEmbedded);
  const touchPrimary = useTouchPrimary();
  const presentation = resolvePresentation({
    embedded,
    touchPrimary,
    override: canUseDOM ? readFrameOverride(window.location.search) : null,
  });

  // Inside the frame, the mouse acts like a finger (task 1.7).
  useEffect(() => (embedded ? installTouchEmulation() : undefined), [embedded]);

  if (presentation === "framed") {
    return (
      <DeviceFrame>
        <AppFrame />
      </DeviceFrame>
    );
  }

  return (
    <ShellContext.Provider value={{ embedded }}>
      {embedded ? <ParentUrlSync /> : null}
      {children}
    </ShellContext.Provider>
  );
}

/** The app itself, loaded at the outer page's current URL. */
function AppFrame() {
  // Set once: later route changes happen inside the iframe and are mirrored outward.
  const [src] = useState(currentUrl);

  return (
    <iframe
      src={src}
      title="PawNote app"
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
