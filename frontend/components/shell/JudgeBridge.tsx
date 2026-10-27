import { router } from "expo-router";
import { useEffect, useRef } from "react";

import { fetchChatChips, fetchChatDraft } from "../../features/chat/chatAi";
import { listMyChats, openChatThread, sendChatMessage } from "../../features/chat/chatApi";
import { DEMO_PASSWORD, demoSetFor } from "../../lib/demo";
import { resetDemo } from "../../lib/demoReset";
import { holderId } from "../../lib/judgeSeat";
import { getSupabase, isSupabaseConfigured } from "../../lib/supabase";
import { Role } from "../../providers/SessionProvider";
import { useTheme } from "../../providers/ThemeProvider";
import { useTrip } from "../../providers/TripProvider";
import {
  JUDGE_DONE,
  JUDGE_PLAYED,
  JudgeCommand,
  JudgeDone,
  JudgePlayed,
  isJudgeCommand,
  isJudgeSignInMessage,
} from "./judgeMessages";
import { ScriptStep, clearSignals, playScript, queueScript, stopScript, takeScript } from "./judgeScript";

// Per phone: the two phones of the split view share one sessionStorage.
const highlightKey = () => `goldito-judge-highlight:${window.name}`;
const HIGHLIGHT_STYLE_ID = "goldito-judge-highlight";

/**
 * Inside a phone frame, the page around it drives this phone for the judge (#411, #413):
 * - signs it in to the other account of the judge set the other phone just took (split view);
 * - the judge panel's commands: reset the set (with this browser's seat), open a screen as one account of the set
 *   (a full load, so nothing from before the reset stays on screen) and outline the control to tap, or play the
 *   other side's chat reply or the drive. Renders nothing; does nothing outside a frame.
 */
export function JudgeBridge() {
  const theme = useTheme();
  const { simulate } = useTrip();
  const simulateRef = useRef(simulate);
  simulateRef.current = simulate;
  const color = useRef(theme.color.primary);
  color.current = theme.color.primary;

  // The outline survives the full load that opened the screen; the next command replaces it.
  useEffect(() => {
    showHighlight(readHighlight(), theme.color.primary);
  }, [theme.color.primary]);

  // A scene that plays itself: the steps the panel queued run once the screen it opened has loaded.
  useEffect(() => {
    if (typeof window === "undefined" || window.parent === window) return;
    const queued = takeScript();
    if (!queued) return;
    showHighlight(null, theme.color.primary);
    playAndTell(queued.steps, theme.color.primary, queued.pace);
    // Once per load.
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || window.parent === window || !isSupabaseConfigured) return;
    const reply = (id: string, ok: boolean, error?: string) => {
      const message: JudgeDone = { type: JUDGE_DONE, id, ok, ...(error ? { error } : {}) };
      window.parent.postMessage(message, window.location.origin);
    };
    const run = async (command: JudgeCommand) => {
      try {
        if (command.op === "reset") {
          await resetDemo(command.state, holderId());
          // Drafts and "seen" marks this browser kept for the old stay would show the last run again.
          clearStayMemory();
          reply(command.id, true);
        } else if (command.op === "go") {
          await signInAs(command.set, command.role);
          const path = await resolvePath(command.path, command.role);
          // Both phones open at once, before either plays, so the last scene's signals go here.
          clearSignals();
          writeHighlight(command.script ? null : command.highlight);
          // A screen the script opens later may name the stay or the pet too ({booking}, {pet}): fill them in now.
          const steps = command.script
            ? await Promise.all(
                command.script.map(async (step) =>
                  "open" in step && step.open.includes("{") ? { open: await resolvePath(step.open, command.role) } : step,
                ),
              )
            : null;
          queueScript(steps ? { steps, pace: command.pace ?? 1 } : null);
          reply(command.id, true);
          window.location.replace(path);
        } else if (command.op === "run") {
          showHighlight(null, color.current);
          reply(command.id, true);
          playAndTell(command.script, color.current, command.pace ?? 1);
        } else if (command.op === "stop") {
          stopScript();
          showHighlight(null, color.current);
          reply(command.id, true);
        } else {
          // One phone: the other side's part runs as the set's other account, then the phone comes back.
          const set = demoSetFor(command.set);
          const email = (await getSupabase().auth.getSession()).data.session?.user.email?.toLowerCase();
          const back: Role = email === set.sitter.email ? "sitter" : "owner";
          const here = `${window.location.pathname}${window.location.search}`;
          const switched = await signInAs(command.set, command.role);
          try {
            await play(command.what, command.set, (args) => simulateRef.current(args));
          } finally {
            if (switched) await signInAs(command.set, back);
          }
          reply(command.id, true);
          if (switched) window.location.replace(here);
        }
      } catch (error) {
        reply(command.id, false, error instanceof Error ? error.message : "Try again.");
      }
    };
    const onMessage = async (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== window.parent) return;
      if (isJudgeCommand(event.data)) {
        await run(event.data);
        return;
      }
      if (!isJudgeSignInMessage(event.data)) return;
      if (await signInAs(event.data.set, event.data.role).catch(() => false)) router.replace("/");
    };
    const listener = (event: MessageEvent) => void onMessage(event);
    window.addEventListener("message", listener);
    return () => window.removeEventListener("message", listener);
  }, []);

  return null;
}

/** Plays a scene's steps and tells the panel how it ended. */
function playAndTell(steps: ScriptStep[], color: string, pace: number): void {
  const tell = (played: Omit<JudgePlayed, "type" | "pane">) => {
    const message: JudgePlayed = { type: JUDGE_PLAYED, pane: window.name, ...played };
    window.parent.postMessage(message, window.location.origin);
  };
  playScript(steps, color, pace).then(
    (end) => {
      if (end === "done") tell({ ok: true });
      else if (end === "stopped") tell({ ok: true, stopped: true });
    },
    (error: unknown) => {
      const message = error instanceof Error ? error.message : "Try Replay.";
      tell(message === "stopped" ? { ok: true, stopped: true } : { ok: false, error: message });
    },
  );
}

/** What the app keeps in this browser per stay or per account: drafts (Add pet, care request, sitter sign-up), the
 * simulated drive, packed / received / paid-seen marks, reminder snoozes. Not the session, the seat or settings. */
const STAY_MEMORY = /^goldito(\.(ownerOnboarding|sitterOnboarding|careRequest|simdrive)\.|:(packed|received|paid-seen):|:due-snoozes$)/;

function clearStayMemory(): void {
  try {
    const keys = Array.from({ length: window.localStorage.length }, (_, i) => window.localStorage.key(i) ?? "");
    keys.filter((key) => STAY_MEMORY.test(key)).forEach((key) => window.localStorage.removeItem(key));
  } catch {
    // Storage blocked: nothing was kept either.
  }
}

/** Signs this phone in to one account of a judge set; true when it changed account. */
async function signInAs(setKey: string, role: Role): Promise<boolean> {
  const set = demoSetFor(setKey);
  if (!set.judge) throw new Error("Not a judge seat.");
  const email = set[role].email;
  const supabase = getSupabase();
  const current = (await supabase.auth.getSession()).data.session?.user.email;
  if (current?.toLowerCase() === email) return false;
  // Not signOut() from the session: the seat stays held, only this phone changes account.
  if (current) await supabase.auth.signOut({ scope: "local" });
  const { error } = await supabase.auth.signInWithPassword({ email, password: DEMO_PASSWORD });
  if (error) throw new Error("Couldn't log in. Try again.");
  return true;
}

async function myId(): Promise<string> {
  const id = (await getSupabase().auth.getSession()).data.session?.user.id;
  if (!id) throw new Error("Log in to continue.");
  return id;
}

/** The set's latest booking (the stay the reset built), with the other person of it. */
async function latestBooking(role: Role): Promise<{ id: string; other: string }> {
  const me = await myId();
  const { data } = await getSupabase()
    .from("bookings")
    .select("id, owner_id, sitter_id")
    .eq(role === "owner" ? "owner_id" : "sitter_id", me)
    .order("created_at", { ascending: false })
    .limit(1);
  const row = (data ?? [])[0] as { id: string; owner_id: string; sitter_id: string } | undefined;
  if (!row) throw new Error("No booking yet. Try Replay.");
  return { id: row.id, other: role === "owner" ? row.sitter_id : row.owner_id };
}

/** The owner's first pet (the set's Max). */
async function firstPet(): Promise<string> {
  const me = await myId();
  const { data } = await getSupabase().from("pets").select("id").eq("owner_id", me).order("created_at", { ascending: true }).limit(1);
  const row = (data ?? [])[0] as { id: string } | undefined;
  if (!row) throw new Error("No pet yet. Try Reset.");
  return row.id;
}

async function resolvePath(path: string, role: Role): Promise<string> {
  if (path === "{chat}") {
    const booking = await latestBooking(role);
    return `/chat/${await openChatThread(booking.other)}`;
  }
  if (path.includes("{booking}")) path = path.replace("{booking}", (await latestBooking(role)).id);
  // The Map's other screens (Mook, Oct 27): the booking's sitter, and the owner's first pet.
  if (path.includes("{sitter}")) path = path.replace("{sitter}", (await latestBooking("owner")).other);
  if (path.includes("{pet}")) path = path.replace("{pet}", await firstPet());
  return path;
}

async function play(
  what: "reply" | "drive",
  setKey: string,
  simulate: ReturnType<typeof useTrip>["simulate"],
): Promise<void> {
  const set = demoSetFor(setKey);
  if (what === "drive") {
    const booking = await latestBooking("owner");
    const result = await simulate({ bookingId: booking.id, kind: "drop_off", otherName: set.sitter.name });
    if (!result.started) throw new Error(result.reason === "error" && result.message ? result.message : "Couldn't start the drive.");
    return;
  }
  // The sitter answers the owner's latest message the way a sitter would: the first chip, its draft, Send.
  const chat = (await listMyChats())[0];
  if (!chat) throw new Error("No chat yet. Send a message first.");
  const chips = await fetchChatChips(chat.threadId);
  const chip = chips?.chips[0];
  const draft = chip ? await fetchChatDraft(chat.threadId, chip.label) : null;
  if (!draft) throw new Error("Couldn't write a reply. Try again.");
  await sendChatMessage(chat.threadId, draft);
}

function readHighlight(): string | null {
  try {
    return window.sessionStorage.getItem(highlightKey());
  } catch {
    return null;
  }
}

function writeHighlight(testID: string | null): void {
  try {
    if (testID) window.sessionStorage.setItem(highlightKey(), testID);
    else window.sessionStorage.removeItem(highlightKey());
  } catch {
    // No storage: the screen opens without the outline.
  }
}

/** Outlines the control to tap (react-native-web renders testID as data-testid). */
function showHighlight(testID: string | null, color: string): void {
  if (typeof document === "undefined") return;
  document.getElementById(HIGHLIGHT_STYLE_ID)?.remove();
  if (!testID || !/^[a-z0-9-]+$/.test(testID)) return;
  const style = document.createElement("style");
  style.id = HIGHLIGHT_STYLE_ID;
  style.textContent = `[data-testid="${testID}"] { outline: 3px solid ${color}; outline-offset: 3px; }`;
  document.head.appendChild(style);
}
