import { useCallback, useEffect, useRef, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { Button } from "../ui/Button";
import { Tag } from "../ui/Tag";
import { demoSetFor } from "../../lib/demo";
import { demoStates } from "../../lib/demoReset";
import { Role } from "../../providers/SessionProvider";
import { useThemedStyles } from "../../providers/ThemeProvider";
import { Theme } from "../../theme/themes";
import { FrameAccount } from "./accountMessage";
import { JUDGE_COMMAND, JudgeCommand, isJudgeDone, isJudgePlayed, paneWindow } from "./judgeMessages";
import type { ScriptStep } from "./judgeScript";
import { RESET_SCENE, SCENES, Scene, SceneTag, TAVILY, TUTORIAL } from "./judgeScenes";
import { TavilyLogo } from "./TavilyLogo";

/** Width the panel takes from the page (the phones scale to what is left). */
export const JUDGE_PANEL_WIDTH = 320;

const WAIT_MS = { reset: 90_000, go: 30_000, play: 60_000 } as const;

type Props = {
  /** The phones on the page: "" (one phone) or "pane-left" and "pane-right" (split view). */
  panes: string[];
  /** Who is signed in to each phone, as the phones tell the page. */
  accounts: Record<string, FrameAccount>;
  /** True while a scene resets the stay and opens its screens (the phones show the paw walk). */
  onSettingUp?: (on: boolean) => void;
};

/** How long after a scene ends "Want to try it yourself?" comes up. */
const TRY_ASK_MS = 2_000;

/** The paw walk stays a moment after the screens open, so the phones' reload is not seen. */
const SETTLE_MS = 1_200;

type WithoutEnvelope<T> = T extends unknown ? Omit<T, "type" | "id"> : never;
type Command = WithoutEnvelope<JudgeCommand>;

/**
 * The judge panel (#413), left of the phone on a computer: five scenes in story order, More (Mood, Live trip,
 * Sticker), Replay and Reset. A scene resets the judge's own set (the seat this browser holds, #411) to what it needs,
 * opens the right screen on each phone and plays itself there (taps and typing, judgeScript), then the other side's
 * reply or the drive when the scene has one. A scene without a script outlines what to tap.
 */
export function JudgePanel({ panes, accounts, onSettingUp }: Props) {
  const styles = useThemedStyles(makeStyles);
  const seat = panes.map((pane) => accounts[pane]?.judge).find(Boolean) ?? null;
  const [active, setActive] = useState<Scene | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [more, setMore] = useState(false);
  const send = useCommands();
  const split = panes.length > 1;
  // A scene playing itself on the phones (judgeScript): the panes playing now, the sides that wait for them (`after`),
  // then each side's finale and the other side's part (`autoPlay`).
  const flow = useRef<Flow | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const [autoPlay, setAutoPlay] = useState<Scene | null>(null);
  const [intro, setIntro] = useState<Scene | null>(null);
  const [tryAsk, setTryAsk] = useState<Scene | null>(null);
  const [resetOpen, setResetOpen] = useState(false);
  // Tutorial is filled until the judge taps it once, so it reads as the first thing to press.
  const [tutorialSeen, setTutorialSeen] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || !isJudgePlayed(event.data)) return;
      const now = flow.current;
      const { pane, ok, stopped, error: failure } = event.data;
      if (!now || !now.panes.includes(pane)) return;
      if (!ok || stopped) {
        if (!ok) setError(failure ?? "Try Replay.");
        flow.current = null;
        setPlaying(null);
        return;
      }
      now.panes = now.panes.filter((p) => p !== pane);
      if (now.panes.length) return;
      const pace = now.scene.pace ?? 1;
      if (now.next.length) {
        now.panes = now.next.map((side) => side.pane);
        now.next.forEach((side) => void send(side.pane, { op: "run", script: side.steps, pace }, WAIT_MS.go).catch(() => undefined));
        now.next = [];
        return;
      }
      now.finale.forEach((side) => void send(side.pane, { op: "run", script: side.steps, pace }, WAIT_MS.go).catch(() => undefined));
      if (now.scene.autoPlay) setAutoPlay(now.scene);
      // A moment to take in the paid booking before the question.
      const tryIt = now.scene.tryIt;
      if (tryIt) setTimeout(() => setTryAsk(tryIt), TRY_ASK_MS);
      flow.current = null;
      setPlaying(null);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [send]);

  /** The panel's Stop: the phones stop where they are and the judge carries on by hand. */
  async function stop() {
    flow.current = null;
    setPlaying(null);
    setAutoPlay(null);
    await Promise.all(panes.map((pane) => send(pane, { op: "stop" }, WAIT_MS.go).catch(() => undefined)));
  }

  /** A scene with an intro asks first; Play starts it. */
  function start(scene: Scene) {
    if (!seat || busy) return;
    if (scene.intro) setIntro(scene);
    else void run(scene);
  }

  useEffect(() => {
    if (!autoPlay || busy) return;
    setAutoPlay(null);
    void play(autoPlay);
    // play reads the seat and panes of this render.
  }, [autoPlay, busy]);

  // Another seat starts the panel over. A phone reloading (a scene opening) reports no account for a moment; that
  // is not a new seat.
  const lastSeat = useRef(seat);
  useEffect(() => {
    if (!seat || seat === lastSeat.current) return;
    lastSeat.current = seat;
    setActive(null);
    setError(null);
  }, [seat]);

  const roleOf = (pane: string): Role => accounts[pane]?.role ?? (pane === "pane-right" ? "sitter" : "owner");
  const paneFor = (role: Role): string => (split ? (panes.find((pane) => roleOf(pane) === role) ?? panes[0]) : panes[0]);

  async function run(scene: Scene) {
    if (!seat || busy) return;
    setBusy(scene.key);
    setError(null);
    flow.current = null;
    setPlaying(null);
    setAutoPlay(null);
    setActive(scene.key === RESET_SCENE.key ? null : scene);
    if (scene.state) onSettingUp?.(true);
    try {
      if (scene.state) {
        const holder = panes.find((pane) => accounts[pane]?.judge === seat) ?? panes[0];
        await send(holder, { op: "reset", state: scene.state }, WAIT_MS.reset);
      }
      const opens = split ? panes.map((pane) => ({ pane, role: roleOf(pane) })) : [{ pane: panes[0], role: scene.lead }];
      // With one phone only the lead side plays, so it never waits for the other.
      const waits = (role: Role) => split && Boolean(scene[role].after);
      const scripted = opens.filter(({ role }) => scene[role].script && !waits(role));
      if (scripted.length) {
        flow.current = {
          scene,
          panes: scripted.map(({ pane }) => pane),
          next: opens.filter(({ role }) => scene[role].script && waits(role)).map(({ pane, role }) => ({ pane, steps: scene[role].script! })),
          finale: opens.filter(({ role }) => scene[role].finale).map(({ pane, role }) => ({ pane, steps: scene[role].finale! })),
        };
        setPlaying(scene.key);
      }
      await Promise.all(
        opens.map(({ pane, role }) =>
          send(
            pane,
            {
              op: "go",
              set: seat,
              role,
              path: scene[role].path,
              highlight: scene[role].highlight ?? null,
              script: waits(role) ? null : (scene[role].script ?? null),
              pace: scene.pace,
            },
            WAIT_MS.go,
          ),
        ),
      );
      if (!scripted.length && scene.autoPlay) setAutoPlay(scene);
    } catch (failure) {
      flow.current = null;
      setPlaying(null);
      setError(failure instanceof Error ? failure.message : "Couldn't open it. Try again.");
    } finally {
      setBusy(null);
      if (scene.state) setTimeout(() => onSettingUp?.(false), SETTLE_MS);
    }
  }

  async function play(scene: Scene) {
    if (!seat || !scene.play || busy) return;
    setBusy(`${scene.key}-play`);
    setError(null);
    try {
      await send(paneFor(scene.play.role), { op: "play", set: seat, what: scene.play.what, role: scene.play.role }, WAIT_MS.play);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Couldn't play it. Try again.");
    } finally {
      setBusy(null);
    }
  }

  const row = (scene: Scene, number?: number) => {
    const on = active?.key === scene.key;
    return (
      <View key={scene.key} style={[styles.scene, on && styles.sceneOn]}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: !seat || busy !== null }}
          onPress={() => start(scene)}
          disabled={!seat || busy !== null}
          style={({ pressed }) => [styles.sceneHead, pressed && styles.pressed]}
          testID={`judge-scene-${scene.key}`}
        >
          <Text style={styles.sceneTitle}>{number ? `${number}. ${scene.title}` : scene.title}</Text>
          <View style={styles.tags}>
            {scene.tags.map((tag) => (
              <SceneTagView key={tag.label} tag={tag} />
            ))}
          </View>
        </Pressable>
        {on ? (
          <View style={styles.sceneBody}>
            <Text style={styles.hint} testID="judge-hint">
              {busy === scene.key ? "Getting it ready…" : scene.hint}
            </Text>
            {playing === scene.key ? (
              <View style={styles.playingRow}>
                <Text style={styles.playing} testID="judge-playing">
                  Playing on the phone…
                </Text>
                <Button label="Stop" variant="secondary" onPress={() => void stop()} testID="judge-stop" />
              </View>
            ) : null}
            {scene.play ? (
              <Button
                label={busy === `${scene.key}-play` ? "Playing…" : scene.play.label}
                onPress={() => void play(scene)}
                disabled={busy !== null}
                testID="judge-play"
              />
            ) : null}
          </View>
        ) : null}
      </View>
    );
  };

  return (
    <ScrollView style={styles.panel} contentContainerStyle={styles.content} testID="judge-panel">
      <View style={styles.header}>
        <Text style={styles.title}>Judge demo</Text>
        {seat ? <Tag label={demoSetFor(seat).label} tone="brand" testID="judge-panel-seat" /> : null}
      </View>
      {!seat ? (
        <Text style={styles.hint} testID="judge-panel-no-seat">
          Take a Judge seat on the phone.
        </Text>
      ) : null}
      <Button
        label="Tutorial"
        variant={tutorialSeen ? "secondary" : "primary"}
        onPress={() => {
          setTutorialSeen(true);
          void run(TUTORIAL);
        }}
        disabled={!seat || busy !== null}
        testID="judge-tutorial"
      />
      {SCENES.filter((scene) => !scene.more).map((scene, index) => row(scene, index + 1))}
      <Pressable
        accessibilityRole="button"
        aria-expanded={more}
        onPress={() => setMore((open) => !open)}
        style={({ pressed }) => [styles.more, pressed && styles.pressed]}
        testID="judge-more"
      >
        <Text style={styles.moreLabel}>{more ? "More ▾" : "More ▸"}</Text>
      </Pressable>
      {more ? SCENES.filter((scene) => scene.more).map((scene) => row(scene)) : null}
      {/* A try-it run (not one of the cards): the judge taps along with the outlines. */}
      {active && playing === active.key && !SCENES.some((scene) => scene.key === active.key) ? (
        <View style={[styles.scene, styles.sceneOn, styles.sceneBody, styles.tryRow]} testID="judge-try-playing">
          <Text style={styles.sceneTitle}>{active.title}</Text>
          <Text style={styles.hint}>{active.hint}</Text>
          <View style={styles.playingRow}>
            <Text style={styles.playing}>{active.key === TUTORIAL.key ? "Playing on the phone…" : "Your turn on the phone."}</Text>
            <Button label="Stop" variant="secondary" onPress={() => void stop()} testID="judge-try-stop" />
          </View>
        </View>
      ) : null}
      <View style={styles.actions}>
        <Button
          label="Log out"
          variant="secondary"
          onPress={() => setLogoutOpen(true)}
          disabled={!seat || busy !== null}
          style={styles.action}
          testID="judge-logout"
        />
        <Button
          label={busy === RESET_SCENE.key ? "Jumping…" : "Jump to"}
          variant="secondary"
          onPress={() => setResetOpen(true)}
          disabled={!seat || busy !== null}
          style={styles.action}
          testID="judge-reset"
        />
      </View>
      {error ? (
        <Text style={styles.error} accessibilityRole="alert" testID="judge-panel-error">
          {error}
        </Text>
      ) : null}
      <Modal visible={logoutOpen} transparent animationType="fade" onRequestClose={() => setLogoutOpen(false)}>
        <View style={styles.backdrop}>
          <View style={styles.introCard} testID="judge-logout-sheet">
            <Text style={styles.introTitle}>Log out?</Text>
            <Text style={styles.introBody}>{seat ? `${demoSetFor(seat).label} frees for the next judge.` : ""}</Text>
            <View style={styles.introActions}>
              <Button label="Cancel" variant="secondary" onPress={() => setLogoutOpen(false)} style={styles.action} testID="judge-logout-cancel" />
              <Button
                label="Log out"
                onPress={() => {
                  setLogoutOpen(false);
                  flow.current = null;
                  setPlaying(null);
                  // Once the phones are signed out, back to one phone on Welcome (not the split view).
                  void Promise.all(panes.map((pane) => send(pane, { op: "logout" }, WAIT_MS.go).catch(() => undefined))).then(() =>
                    window.location.assign("/welcome"),
                  );
                }}
                style={styles.action}
                testID="judge-logout-confirm"
              />
            </View>
          </View>
        </View>
      </Modal>
      <Modal visible={resetOpen} transparent animationType="fade" onRequestClose={() => setResetOpen(false)}>
        <View style={styles.backdrop}>
          <View style={styles.introCard} testID="judge-reset-sheet">
            <Text style={styles.introTitle}>Jump to</Text>
            {seat
              ? demoStates("owner", demoSetFor(seat).sitter.name, demoSetFor(seat).pets).map((state) => (
                  <Pressable
                    key={state.value}
                    accessibilityRole="button"
                    onPress={() => {
                      setResetOpen(false);
                      void run({ ...RESET_SCENE, state: state.value });
                    }}
                    style={({ pressed }) => [styles.resetRow, pressed && styles.pressed]}
                    testID={`judge-reset-${state.value}`}
                  >
                    <Text style={styles.sceneTitle}>{state.label}</Text>
                    <Text style={styles.hint}>{state.hint}</Text>
                  </Pressable>
                ))
              : null}
            <Button label="Cancel" variant="secondary" onPress={() => setResetOpen(false)} testID="judge-reset-cancel" />
          </View>
        </View>
      </Modal>
      <Modal visible={tryAsk !== null} transparent animationType="fade" onRequestClose={() => setTryAsk(null)}>
        <View style={styles.backdrop}>
          <View style={styles.introCard} testID="judge-try">
            <Text style={styles.introTitle}>Want to try it yourself?</Text>
            <Text style={styles.introBody}>{tryAsk?.hint}</Text>
            <View style={styles.introActions}>
              <Button label="No" variant="secondary" onPress={() => setTryAsk(null)} style={styles.action} testID="judge-try-no" />
              <Button
                label="Yes"
                onPress={() => {
                  const scene = tryAsk;
                  setTryAsk(null);
                  if (scene) void run(scene);
                }}
                style={styles.action}
                testID="judge-try-yes"
              />
            </View>
          </View>
        </View>
      </Modal>
      <Modal visible={intro !== null} transparent animationType="fade" onRequestClose={() => setIntro(null)}>
        <View style={styles.backdrop}>
          <View style={styles.introCard} testID="judge-intro">
            <Text style={styles.introTitle}>{intro?.intro?.title}</Text>
            <Text style={styles.introBody}>{intro?.intro?.body}</Text>
            {intro?.intro?.note ? (
              <Text style={styles.introNote} testID="judge-intro-note">
                {intro.intro.note}
              </Text>
            ) : null}
            <View style={styles.introActions}>
              <Button label="Not now" variant="secondary" onPress={() => setIntro(null)} style={styles.action} testID="judge-intro-cancel" />
              <Button
                label="Play"
                onPress={() => {
                  const scene = intro;
                  setIntro(null);
                  if (scene) void run(scene);
                }}
                style={styles.action}
                testID="judge-intro-play"
              />
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

type Flow = {
  scene: Scene;
  panes: string[];
  next: { pane: string; steps: ScriptStep[] }[];
  finale: { pane: string; steps: ScriptStep[] }[];
};

/** A model tag; Tavily shows its logo. */
function SceneTagView({ tag }: { tag: SceneTag }) {
  const styles = useThemedStyles(makeStyles);
  if (tag.label === TAVILY.label) {
    return (
      <View style={styles.logoTag} accessibilityLabel="Tavily" testID="judge-tag-tavily">
        <TavilyLogo height={14} />
      </View>
    );
  }
  return <Tag label={tag.label} tone={tag.nvidia ? "brand" : "neutral"} />;
}

/** Sends a command to a phone and waits for its answer. */
function useCommands() {
  const waiting = useRef(new Map<string, (done: { ok: boolean; error?: string }) => void>());
  const next = useRef(0);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || !isJudgeDone(event.data)) return;
      waiting.current.get(event.data.id)?.(event.data);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  return useCallback((pane: string, command: Command, timeout: number) => {
    const target = paneWindow(pane);
    if (!target) return Promise.reject(new Error("The phone is not ready. Try again."));
    next.current += 1;
    const id = `judge-${next.current}`;
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        waiting.current.delete(id);
        reject(new Error("The phone did not answer. Try again."));
      }, timeout);
      waiting.current.set(id, (done) => {
        clearTimeout(timer);
        waiting.current.delete(id);
        if (done.ok) resolve();
        else reject(new Error(done.error ?? "Try again."));
      });
      target.postMessage({ ...command, type: JUDGE_COMMAND, id } as JudgeCommand, window.location.origin);
    });
  }, []);
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    panel: {
      width: JUDGE_PANEL_WIDTH,
      flexGrow: 0,
      backgroundColor: theme.color.surface,
      borderRightWidth: 1,
      borderRightColor: theme.color.border,
    },
    content: { padding: theme.spacing.md, gap: theme.spacing.sm },
    header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: theme.spacing.sm },
    title: { fontSize: theme.fontSize.lead, fontWeight: theme.fontWeight.bold, color: theme.color.text },
    hint: { fontSize: theme.fontSize.small, color: theme.color.textMuted },
    playing: { flex: 1, fontSize: theme.fontSize.small, fontWeight: theme.fontWeight.semibold, color: theme.color.primary },
    playingRow: { flexDirection: "row", alignItems: "center", gap: theme.spacing.sm },
    resetRow: {
      minHeight: 44,
      justifyContent: "center",
      gap: 2,
      paddingVertical: theme.spacing.xs + 2,
      paddingHorizontal: theme.spacing.sm,
      borderRadius: theme.radius.lg,
      // The same line as the Cancel button under the list (a secondary button).
      borderWidth: theme.ui.button.secondaryBorder,
      borderColor: theme.ui.button.secondaryInk ? theme.color.text : theme.color.borderStrong,
    },
    tryRow: { paddingTop: theme.spacing.sm + 4, gap: theme.spacing.xs + 2 },
    backdrop: { flex: 1, alignItems: "center", justifyContent: "center", padding: theme.spacing.lg, backgroundColor: "rgba(0,0,0,0.4)" },
    introCard: {
      width: "100%",
      maxWidth: 420,
      gap: theme.spacing.md,
      padding: theme.spacing.lg,
      borderRadius: theme.radius.xl,
      backgroundColor: theme.color.surface,
    },
    introTitle: { fontSize: theme.fontSize.title, fontWeight: theme.fontWeight.bold, color: theme.color.text },
    introBody: { fontSize: theme.fontSize.body, lineHeight: 24, color: theme.color.text },
    introNote: { fontSize: theme.fontSize.caption, color: theme.color.textMuted },
    introActions: { flexDirection: "row", gap: theme.spacing.sm },
    scene: {
      borderWidth: 1,
      borderColor: theme.color.borderStrong,
      borderRadius: theme.radius.lg,
      backgroundColor: theme.color.surface,
      overflow: "hidden",
    },
    sceneOn: { borderColor: theme.color.primary, borderWidth: 2 },
    sceneHead: { padding: theme.spacing.sm + 4, gap: theme.spacing.xs + 2, minHeight: 44 },
    sceneTitle: { fontSize: theme.fontSize.body, fontWeight: theme.fontWeight.bold, color: theme.color.text },
    tags: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: theme.spacing.xs },
    logoTag: {
      height: 26,
      justifyContent: "center",
      paddingHorizontal: theme.spacing.sm,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: theme.color.border,
      backgroundColor: theme.color.surface,
    },
    sceneBody: { paddingHorizontal: theme.spacing.sm + 4, paddingBottom: theme.spacing.sm + 4, gap: theme.spacing.sm },
    pressed: { opacity: 0.85 },
    more: { minHeight: 44, justifyContent: "center" },
    moreLabel: { fontSize: theme.fontSize.body, fontWeight: theme.fontWeight.semibold, color: theme.color.primary },
    actions: { flexDirection: "row", gap: theme.spacing.sm, marginTop: theme.spacing.xs },
    action: { flex: 1 },
    error: { fontSize: theme.fontSize.small, color: theme.color.error },
  });
