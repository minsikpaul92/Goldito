import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { Button } from "../ui/Button";
import { Tag } from "../ui/Tag";
import { demoSetFor } from "../../lib/demo";
import { Role } from "../../providers/SessionProvider";
import { useThemedStyles } from "../../providers/ThemeProvider";
import { Theme } from "../../theme/themes";
import { FrameAccount } from "./accountMessage";
import { JUDGE_COMMAND, JudgeCommand, isJudgeDone, paneWindow } from "./judgeMessages";
import { RESET_SCENE, SCENES, Scene } from "./judgeScenes";

/** Width the panel takes from the page (the phones scale to what is left). */
export const JUDGE_PANEL_WIDTH = 320;

const WAIT_MS = { reset: 90_000, go: 30_000, play: 60_000 } as const;

type Props = {
  /** The phones on the page: "" (one phone) or "pane-left" and "pane-right" (split view). */
  panes: string[];
  /** Who is signed in to each phone, as the phones tell the page. */
  accounts: Record<string, FrameAccount>;
};

type Command = JudgeCommand extends infer C ? (C extends JudgeCommand ? Omit<C, "type" | "id"> : never) : never;

/**
 * The judge panel (#413), left of the phone on a computer: five scenes in story order, More (Mood, Live trip,
 * Sticker), Replay and Reset. A scene resets the judge's own set (the seat this browser holds, #411) to what it needs,
 * opens the right screen on each phone and outlines what to tap. Play drives only the other side's reply or the drive.
 */
export function JudgePanel({ panes, accounts }: Props) {
  const styles = useThemedStyles(makeStyles);
  const seat = panes.map((pane) => accounts[pane]?.judge).find(Boolean) ?? null;
  const [active, setActive] = useState<Scene | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [more, setMore] = useState(false);
  const send = useCommands();
  const split = panes.length > 1;

  // A seat that changes (a new judge, or none) starts the panel over.
  useEffect(() => {
    setActive(null);
    setError(null);
  }, [seat]);

  const roleOf = (pane: string): Role => accounts[pane]?.role ?? (pane === "pane-right" ? "sitter" : "owner");
  const paneFor = (role: Role): string => (split ? (panes.find((pane) => roleOf(pane) === role) ?? panes[0]) : panes[0]);

  async function run(scene: Scene) {
    if (!seat || busy) return;
    setBusy(scene.key);
    setError(null);
    setActive(scene === RESET_SCENE ? null : scene);
    try {
      if (scene.state) {
        const holder = panes.find((pane) => accounts[pane]?.judge === seat) ?? panes[0];
        await send(holder, { op: "reset", state: scene.state }, WAIT_MS.reset);
      }
      const opens = split ? panes.map((pane) => ({ pane, role: roleOf(pane) })) : [{ pane: panes[0], role: scene.lead }];
      await Promise.all(
        opens.map(({ pane, role }) =>
          send(pane, { op: "go", set: seat, role, path: scene[role].path, highlight: scene[role].highlight ?? null }, WAIT_MS.go),
        ),
      );
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Couldn't open it. Try again.");
    } finally {
      setBusy(null);
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
          onPress={() => void run(scene)}
          disabled={!seat || busy !== null}
          style={({ pressed }) => [styles.sceneHead, pressed && styles.pressed]}
          testID={`judge-scene-${scene.key}`}
        >
          <Text style={styles.sceneTitle}>{number ? `${number}. ${scene.title}` : scene.title}</Text>
          <View style={styles.tags}>
            {scene.tags.map((tag) => (
              <Tag key={tag.label} label={tag.label} tone={tag.nvidia ? "brand" : "neutral"} />
            ))}
          </View>
        </Pressable>
        {on ? (
          <View style={styles.sceneBody}>
            <Text style={styles.hint} testID="judge-hint">
              {busy === scene.key ? "Getting it ready…" : scene.hint}
            </Text>
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
      <View style={styles.actions}>
        <Button
          label="Replay"
          variant="secondary"
          onPress={() => active && void run(active)}
          disabled={!seat || !active || busy !== null}
          style={styles.action}
          testID="judge-replay"
        />
        <Button
          label={busy === RESET_SCENE.key ? "Resetting…" : "Reset"}
          variant="secondary"
          onPress={() => void run(RESET_SCENE)}
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
    </ScrollView>
  );
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
    tags: { flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.xs },
    sceneBody: { paddingHorizontal: theme.spacing.sm + 4, paddingBottom: theme.spacing.sm + 4, gap: theme.spacing.sm },
    pressed: { opacity: 0.85 },
    more: { minHeight: 44, justifyContent: "center" },
    moreLabel: { fontSize: theme.fontSize.body, fontWeight: theme.fontWeight.semibold, color: theme.color.primary },
    actions: { flexDirection: "row", gap: theme.spacing.sm, marginTop: theme.spacing.xs },
    action: { flex: 1 },
    error: { fontSize: theme.fontSize.small, color: theme.color.error },
  });
