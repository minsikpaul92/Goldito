import Ionicons from "@expo/vector-icons/Ionicons";
import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { BigInput } from "./BigInput";
import { Banner } from "../ui/Banner";
import { Button } from "../ui/Button";
import { TextButton } from "../ui/TextButton";
import { MAX_RECORDING_MS, Recording, VoiceError, isVoiceSupported, startRecording } from "../../lib/voiceRecorder";
import { transcribeRecording } from "../../features/ownerOnboarding/voiceApi";
import { useTheme, useThemedStyles } from "../../providers/ThemeProvider";
import { Theme } from "../../theme/themes";

type Props = {
  /** The box's hint, e.g. "What is Max like?". */
  placeholder: string;
  /** The (possibly fixed) text, ready to be read for facts. The screen does the rest and moves on. */
  onUse: (text: string) => Promise<void>;
  /** A failure of the reading step, to show under the text. */
  error: string | null;
  busy: boolean;
};

type Phase = "idle" | "recording" | "reading";

const MAX_TEXT = 1500;

const clock = (ms: number) => `${Math.floor(ms / 60_000)}:${String(Math.floor((ms % 60_000) / 1000)).padStart(2, "0")}`;

/**
 * "Tell us about {name}": a big microphone button, the words it heard (the owner can fix them), or typing instead.
 * The recording goes to a speech-to-text service once and is not kept (11.15 §6.2).
 */
export function VoiceStep({ placeholder, onUse, error, busy }: Props) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [phase, setPhase] = useState<Phase>("idle");
  const [text, setText] = useState("");
  const [typing, setTyping] = useState(!isVoiceSupported());
  const [problem, setProblem] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const recording = useRef<Recording | null>(null);

  useEffect(() => {
    if (phase !== "recording") return;
    const started = Date.now();
    const tick = setInterval(() => setElapsed(Date.now() - started), 250);
    return () => clearInterval(tick);
  }, [phase]);

  // Leaving the screen ends the recording, so the microphone never stays on.
  useEffect(
    () => () => {
      void recording.current?.stop();
    },
    [],
  );

  const finish = async () => {
    const current = recording.current;
    if (!current) return;
    recording.current = null;
    setPhase("reading");
    try {
      const blob = await current.stop();
      const transcript = await transcribeRecording(blob);
      if (transcript.trim() === "") setProblem("We didn't hear anything. Try again, or type it.");
      else setText((before) => (before.trim() ? `${before.trim()} ${transcript}` : transcript));
      setTyping(true);
    } catch (e) {
      setProblem((e as Error).message || "We couldn't read that recording. Try again, or type it.");
      setTyping(true);
    } finally {
      setPhase("idle");
    }
  };

  const toggle = async () => {
    setProblem(null);
    if (phase === "recording") {
      await finish();
      return;
    }
    if (phase !== "idle" || busy) return;
    try {
      setElapsed(0);
      recording.current = await startRecording(() => void finish());
      setPhase("recording");
    } catch (e) {
      setProblem(
        e instanceof VoiceError && e.reason === "denied"
          ? "The microphone is off for Goldito in this browser. You can type it instead."
          : "We can't record here. You can type it instead.",
      );
      setTyping(true);
    }
  };

  const recordingNow = phase === "recording";
  return (
    <View style={styles.root}>
      {isVoiceSupported() ? (
        <View style={styles.micRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={recordingNow ? "Stop recording" : "Start recording"}
            onPress={() => void toggle()}
            disabled={phase === "reading" || busy}
            style={[styles.mic, recordingNow && styles.micOn, (phase === "reading" || busy) && styles.micOff]}
            testID="own-mic"
          >
            <Ionicons name={recordingNow ? "stop" : "mic"} size={40} color={theme.color.primaryText} />
          </Pressable>
          <Text style={styles.status} testID="own-mic-status">
            {phase === "reading" ? "Reading what you said…" : recordingNow ? `${clock(elapsed)} of ${clock(MAX_RECORDING_MS)}` : "Tap to talk"}
          </Text>
        </View>
      ) : null}

      {problem ? <Banner tone="warning" body={problem} testID="own-voice-problem" /> : null}

      {typing ? (
        <BigInput
          value={text}
          onChangeText={(value) => setText(value.slice(0, MAX_TEXT))}
          multiline
          placeholder={placeholder}
          accessibilityLabel="What you said"
          testID="own-voice-text"
        />
      ) : (
        <TextButton label="Or type it" onPress={() => setTyping(true)} testID="own-voice-type" />
      )}

      {error ? <Banner tone="warning" body={error} testID="own-voice-error" /> : null}
      {typing ? (
        <Button
          label={busy ? "Looking…" : "Use this"}
          onPress={() => void onUse(text.trim())}
          disabled={busy || phase !== "idle" || text.trim() === ""}
          testID="own-voice-use"
        />
      ) : null}
      <Text style={styles.note}>Your voice is sent to a speech-to-text service to make text. We don't keep the recording.</Text>
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    root: { gap: theme.spacing.md },
    micRow: { alignItems: "center", gap: theme.spacing.sm, paddingVertical: theme.spacing.sm },
    mic: {
      width: 88,
      height: 88,
      borderRadius: 44,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.color.primary,
    },
    micOn: { backgroundColor: theme.color.error },
    micOff: { opacity: theme.opacity.disabled },
    status: { fontSize: 18, lineHeight: 24, color: theme.color.text, fontWeight: theme.fontWeight.semibold },
    note: { fontSize: 18, lineHeight: 24, color: theme.color.textMuted },
  });
