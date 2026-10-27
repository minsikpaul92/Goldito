/**
 * A scene that plays itself (#413 follow-up): after the judge panel opens a screen, the phone taps and types the way a
 * person would, one step at a time, with the control outlined first so the judge can follow. Controls are found by
 * testID (react-native-web renders it as data-testid); a `*` stands for an id part such as a pet id
 * ("pet-action-*-feed"). The steps wait for each control, so AI answers that take a while are part of the show.
 * Web only. The steps left are kept in sessionStorage, per phone, so an `open` (a full load) carries on after it.
 */

export type ScriptStep =
  /** Tap a control (waits until it is enabled). */
  | { tap: string; timeout?: number }
  /** Type into a text field, a letter at a time. */
  | { type: string; text: string }
  /** Wait until a control shows (an AI answer, the next page). */
  | { wait: string; timeout?: number }
  /** Wait until at least `n` of a control show (the other side's new chat message has arrived). */
  | { count: string; n: number; timeout?: number }
  /** Wait until a control is gone (a spinner). */
  | { gone: string; timeout?: number }
  /** Wait until a text field or text holds something (an AI draft). */
  | { filled: string; timeout?: number }
  /** Wait a moment so the judge can read the screen. */
  | { pause: number }
  /** Open another screen (a full load); the rest plays there. */
  | { open: string }
  /** The end: a pulsing outline and a note on a control, asking the judge to try it (until it is tapped). */
  | { invite: string; text: string }
  /** Tap a control only if it shows within a moment (an optional choice, e.g. a nearby meeting spot). */
  | { tapIf: string }
  /** Tap the first of these controls whose words match `prefer` (a pattern, any case), else the first one (an AI chip). */
  | { tapBest: string; prefer: string; timeout?: number }
  /** Tell the other phone this side got here (two phones taking turns in one scene). */
  | { signal: string }
  /** Wait for the other phone's signal. */
  | { until: string; timeout?: number };

const FIND_MS = 20_000;
const BEAT_MS = 700;
const KEY_MS = 45;
const INVITE_ID = "goldito-judge-invite";

// Signals between the two phones go through sessionStorage, which both phones of the page share (same origin), so a
// signal sent before the other side waits for it, or across its reload, is not lost.
const SIGNAL_PREFIX = "goldito-judge-signal:";
const TAP_IF_MS = 3_000;
const UNTIL_MS = 180_000;

function sendSignal(name: string): void {
  try {
    window.sessionStorage.setItem(`${SIGNAL_PREFIX}${name}`, "1");
  } catch {
    // No storage: the other phone's wait runs out and says so.
  }
}

function hasSignal(name: string): boolean {
  try {
    return window.sessionStorage.getItem(`${SIGNAL_PREFIX}${name}`) === "1";
  } catch {
    return false;
  }
}

/** A new scene starts with no signals from the last one. */
export function clearSignals(): void {
  try {
    const keys = Array.from({ length: window.sessionStorage.length }, (_, i) => window.sessionStorage.key(i) ?? "");
    keys.filter((key) => key.startsWith(SIGNAL_PREFIX)).forEach((key) => window.sessionStorage.removeItem(key));
  } catch {
    // Nothing kept.
  }
}

/** Stop asks the playing script to end after the step it is on (the panel's Stop). */
let stopAsked = false;

export function stopScript(): void {
  stopAsked = true;
  save(null);
  clearInvite();
}

const scriptKey = () => `goldito-judge-script:${window.name}`;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function selector(testID: string): string {
  const star = testID.indexOf("*");
  if (star < 0) return `[data-testid="${testID}"]`;
  const head = testID.slice(0, star);
  const tail = testID.slice(star + 1);
  return `[data-testid^="${head}"]${tail ? `[data-testid$="${tail}"]` : ""}`;
}

function visible(el: HTMLElement): boolean {
  return el.getClientRects().length > 0;
}

function query(testID: string): HTMLElement | null {
  return Array.from(document.querySelectorAll<HTMLElement>(selector(testID))).find(visible) ?? null;
}

function enabled(el: HTMLElement): boolean {
  return el.getAttribute("aria-disabled") !== "true" && !(el as HTMLButtonElement).disabled;
}

function textOf(el: HTMLElement): string {
  const input = el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement ? el : el.querySelector("input, textarea");
  return (input ? (input as HTMLInputElement).value : el.innerText).trim();
}

async function until<T>(check: () => T | null, timeout: number, what: string): Promise<T> {
  const end = Date.now() + timeout;
  for (;;) {
    const found = check();
    if (found) return found;
    if (stopAsked) throw new Error("stopped");
    if (Date.now() > end) throw new Error(`Couldn't find ${what}. Try Replay.`);
    await sleep(200);
  }
}

/** The input inside a TextField wrapper, or the element itself. */
function field(el: HTMLElement): HTMLInputElement | HTMLTextAreaElement {
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return el;
  const inner = el.querySelector<HTMLInputElement | HTMLTextAreaElement>("input, textarea");
  if (!inner) throw new Error("Not a text field.");
  return inner;
}

/** Sets a React-controlled input's value so its onChangeText runs. */
function setValue(input: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const proto = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function mark(el: HTMLElement, color: string): () => void {
  const before = { outline: el.style.outline, offset: el.style.outlineOffset };
  el.style.outline = `3px solid ${color}`;
  el.style.outlineOffset = "3px";
  el.scrollIntoView({ block: "center", behavior: "smooth" });
  return () => {
    el.style.outline = before.outline;
    el.style.outlineOffset = before.offset;
  };
}

export type QueuedScript = { steps: ScriptStep[]; pace: number };

function save(script: QueuedScript | null): void {
  try {
    if (script?.steps.length) window.sessionStorage.setItem(scriptKey(), JSON.stringify(script));
    else window.sessionStorage.removeItem(scriptKey());
  } catch {
    // No storage: the screen opens and the judge taps by hand.
  }
}

/** Keeps the steps for this phone; they play once its next screen loads. */
export function queueScript(script: QueuedScript | null): void {
  save(script);
}

/** The steps this phone still has to play, taken out of storage (so a reload does not play them twice). */
export function takeScript(): QueuedScript | null {
  try {
    const raw = window.sessionStorage.getItem(scriptKey());
    window.sessionStorage.removeItem(scriptKey());
    return raw ? (JSON.parse(raw) as QueuedScript) : null;
  } catch {
    return null;
  }
}

function clearInvite(): void {
  document.getElementById(INVITE_ID)?.remove();
  document.getElementById(`${INVITE_ID}-style`)?.remove();
  document.querySelectorAll("[data-judge-invite]").forEach((el) => el.removeAttribute("data-judge-invite"));
}

/** A pulsing outline on the control and a note above it, until the judge taps it. */
function invite(el: HTMLElement, text: string, color: string): void {
  clearInvite();
  const style = document.createElement("style");
  style.id = `${INVITE_ID}-style`;
  style.textContent = `@keyframes goldito-invite { 0%, 100% { box-shadow: 0 0 0 0 ${color}99; } 50% { box-shadow: 0 0 0 10px ${color}00; } }
[data-judge-invite] { outline: 3px solid ${color}; outline-offset: 3px; animation: goldito-invite 1.2s ease-in-out infinite; }`;
  document.head.appendChild(style);
  el.setAttribute("data-judge-invite", "");
  el.scrollIntoView({ block: "center", behavior: "smooth" });
  const note = document.createElement("div");
  note.id = INVITE_ID;
  note.textContent = text;
  Object.assign(note.style, {
    position: "fixed",
    left: "16px",
    right: "16px",
    top: "12px",
    padding: "10px 14px",
    borderRadius: "14px",
    background: color,
    color: "#fff", // tokens-ok: a plain DOM note on the brand color, outside the app's theme
    font: "600 14px system-ui, sans-serif",
    textAlign: "center",
    zIndex: "9999",
    cursor: "pointer",
  });
  // Tapping the note hides it (it can sit over Back); the glow stays until the control is tapped.
  note.addEventListener("click", () => note.remove(), { once: true });
  document.body.appendChild(note);
  el.addEventListener("click", clearInvite, { once: true });
}

/**
 * Plays the steps; `pace` above 1 plays them slower (Treat check plays at half speed). Resolves "done" at the end,
 * "moved" when an `open` step loads another screen (the rest plays there), or "stopped" on the panel's Stop. Throws a
 * short message when a control never shows.
 */
export async function playScript(steps: ScriptStep[], color: string, pace = 1): Promise<"done" | "moved" | "stopped"> {
  stopAsked = false;
  const wait = (ms: number) => sleep(ms * pace);
  for (let i = 0; i < steps.length; i += 1) {
    if (stopAsked) return "stopped";
    const step = steps[i];
    if ("pause" in step) {
      await wait(step.pause);
    } else if ("open" in step) {
      save({ steps: steps.slice(i + 1), pace });
      window.location.assign(step.open);
      return "moved";
    } else if ("signal" in step) {
      sendSignal(step.signal);
    } else if ("until" in step) {
      await until(() => (hasSignal(step.until) ? true : null), step.timeout ?? UNTIL_MS, `the other phone (${step.until})`);
    } else if ("tapBest" in step) {
      const pattern = new RegExp(step.prefer, "i");
      const el = await until(() => {
        const all = Array.from(document.querySelectorAll<HTMLElement>(selector(step.tapBest))).filter((c) => visible(c) && enabled(c));
        return all.find((c) => pattern.test(c.innerText)) ?? all[0] ?? null;
      }, step.timeout ?? FIND_MS, step.tapBest);
      const unmark = mark(el, color);
      await wait(BEAT_MS);
      el.click();
      await wait(BEAT_MS / 2);
      unmark();
    } else if ("tapIf" in step) {
      const found = await until(() => query(step.tapIf), TAP_IF_MS, step.tapIf).catch(() => null);
      if (found && enabled(found)) {
        const unmark = mark(found, color);
        await wait(BEAT_MS);
        found.click();
        await wait(BEAT_MS / 2);
        unmark();
      }
    } else if ("invite" in step) {
      const el = await until(() => query(step.invite), FIND_MS, step.invite);
      invite(el, step.text, color);
    } else if ("wait" in step) {
      await until(() => query(step.wait), step.timeout ?? FIND_MS, step.wait);
    } else if ("count" in step) {
      await until(
        () => (Array.from(document.querySelectorAll<HTMLElement>(selector(step.count))).filter(visible).length >= step.n ? true : null),
        step.timeout ?? FIND_MS,
        `${step.n} × ${step.count}`,
      );
    } else if ("gone" in step) {
      await until(() => (query(step.gone) ? null : true), step.timeout ?? FIND_MS, `${step.gone} to finish`);
    } else if ("filled" in step) {
      await until(() => {
        const el = query(step.filled);
        return el && textOf(el) ? el : null;
      }, step.timeout ?? FIND_MS, step.filled);
    } else {
      const id = "tap" in step ? step.tap : step.type;
      const el = await until(() => {
        const found = query(id);
        return found && enabled(found) ? found : null;
      }, ("tap" in step ? step.timeout : undefined) ?? FIND_MS, id);
      const unmark = mark(el, color);
      await wait(BEAT_MS);
      if (stopAsked) {
        unmark();
        return "stopped";
      }
      if ("tap" in step) {
        el.click();
      } else {
        const input = field(el);
        input.focus();
        for (let k = 1; k <= step.text.length; k += 1) {
          setValue(input, step.text.slice(0, k));
          await wait(KEY_MS);
        }
      }
      await wait(BEAT_MS / 2);
      unmark();
    }
  }
  return "done";
}
