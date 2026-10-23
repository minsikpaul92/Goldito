import Ionicons from "@expo/vector-icons/Ionicons";
import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { BigInput } from "./BigInput";
import { Banner } from "../ui/Banner";
import { Button } from "../ui/Button";
import { TextButton } from "../ui/TextButton";
import { MAX_RECORDING_MS, Recording, VoiceError, isVoiceSupported, startRecording } from "../../lib/voiceRecorder";
import { transcribeRecording } from "../../features/ownerOnboarding/voiceApi";
import { useTheme, useThemedStyles } from "../../providers/ThemeProvider";
import { Theme } from "../../theme/themes";

export type InterviewItem = { key: string; question: string; placeholder?: string; multiline?: boolean };

type Props = {
  /** The questions, in the order they are read out and asked on the form. */
  items: InterviewItem[];
  /** The words said, read for an answer per item. Throws an Error whose message says what to do instead. */
  parse: (text: string) => Promise<Record<string, string>>;
  /** The answers the person kept, one text per item key. */
  onSubmit: (values: Record<string, string>) => void;
};

type Phase = "idle" | "recording" | "reading" | "transcript" | "parsing" | "form";

const STAGE_HEIGHT = 440;
const MIC = 96;
// Waveform bars above the mic, the mic, its status line.
const MIC_BLOCK = 44 + MIC + 40;
const BARS = 21;
const MAX_TEXT = 1500;

const clock = (ms: number) => `${Math.floor(ms / 60_000)}:${String(Math.floor((ms % 60_000) / 1000)).padStart(2, "0")}`;

/**
 * Talk through a list of questions. A microphone sits in the middle; when it is tapped it slides down, the questions
 * are written out above it line by line, and a waveform shows the voice is coming in. After the recording the whole
 * text is shown, then one box per question with what was heard in it, to fix. Typing is the same boxes, empty.
 * The recording goes to a speech-to-text service once and is not kept.
 */
export function VoiceInterview({ items, parse, onSubmit }: Props) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [phase, setPhase] = useState<Phase>(isVoiceSupported() ? "idle" : "form");
  const [transcript, setTranscript] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [problem, setProblem] = useState<string | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [levels, setLevels] = useState<number[]>(() => Array(BARS).fill(0));
  const recording = useRef<Recording | null>(null);
  const slide = useRef(new Animated.Value(0)).current;
  const lines = useRef(items.map(() => new Animated.Value(0))).current;
  const level = useRef(new Animated.Value(0)).current;

  const stageOpen = phase === "recording" || phase === "reading";

  useEffect(() => {
    Animated.timing(slide, {
      toValue: stageOpen ? 1 : 0,
      duration: 520,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
    if (phase === "recording") {
      lines.forEach((line) => line.setValue(0));
      Animated.stagger(
        260,
        lines.map((line) => Animated.timing(line, { toValue: 1, duration: 360, useNativeDriver: false })),
      ).start();
    }
  }, [phase, slide, lines, stageOpen]);

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

  const onLevel = (next: number) => {
    setLevels((before) => [...before.slice(1), next]);
    Animated.timing(level, { toValue: next, duration: 80, useNativeDriver: false }).start();
  };

  const finish = async () => {
    const current = recording.current;
    if (!current) return;
    recording.current = null;
    setPhase("reading");
    try {
      const blob = await current.stop();
      const text = await transcribeRecording(blob);
      if (text.trim() === "") {
        setProblem("We didn't hear anything. Try again, or type it.");
        setPhase("idle");
        return;
      }
      setTranscript((before) => (before.trim() ? `${before.trim()} ${text}` : text));
      setPhase("transcript");
    } catch (e) {
      setProblem((e as Error).message || "We couldn't read that recording. Try again, or type it.");
      setPhase("idle");
    }
  };

  const toggle = async () => {
    setProblem(null);
    if (phase === "recording") {
      await finish();
      return;
    }
    if (phase !== "idle") return;
    try {
      setElapsed(0);
      setLevels(Array(BARS).fill(0));
      recording.current = await startRecording(() => void finish(), onLevel);
      setPhase("recording");
    } catch (e) {
      setProblem(
        e instanceof VoiceError && e.reason === "denied"
          ? "The microphone is off for Goldito in this browser. You can type it instead."
          : "We can't record here. You can type it instead.",
      );
      setPhase("form");
    }
  };

  const fill = async () => {
    setPhase("parsing");
    setParseError(null);
    try {
      setValues(await parse(transcript.trim()));
    } catch (e) {
      setValues({});
      setParseError((e as Error).message);
    }
    setPhase("form");
  };

  if (phase === "transcript" || phase === "parsing") {
    const parsing = phase === "parsing";
    return (
      <View style={styles.root}>
        <Text style={styles.heading}>Here is what we heard</Text>
        <BigInput
          value={transcript}
          onChangeText={(value) => setTranscript(value.slice(0, MAX_TEXT))}
          multiline
          editable={!parsing}
          accessibilityLabel="What you said"
          testID="own-voice-text"
        />
        <Button
          label={parsing ? "Reading…" : "Fill in the answers"}
          onPress={() => void fill()}
          disabled={parsing || transcript.trim() === ""}
          testID="own-voice-fill"
        />
        <TextButton
          label="Record again"
          onPress={() => {
            setTranscript("");
            setPhase("idle");
          }}
          disabled={parsing}
          testID="own-voice-again"
        />
      </View>
    );
  }

  if (phase === "form") {
    return (
      <View style={styles.root} testID="own-voice-form">
        {problem ? <Banner tone="warning" body={problem} testID="own-voice-problem" /> : null}
        {parseError ? <Banner tone="warning" body={parseError} testID="own-voice-error" /> : null}
        {items.map((item) => (
          <View key={item.key} style={styles.field}>
            <Text style={styles.label}>{item.question}</Text>
            <BigInput
              value={values[item.key] ?? ""}
              onChangeText={(value) => setValues((before) => ({ ...before, [item.key]: value.slice(0, MAX_TEXT) }))}
              multiline={item.multiline}
              placeholder={item.placeholder}
              accessibilityLabel={item.question}
              testID={`own-voice-${item.key}`}
            />
          </View>
        ))}
        <Button label="Use these" onPress={() => onSubmit(values)} testID="own-voice-use" />
      </View>
    );
  }

  const recordingNow = phase === "recording";
  const micTop = slide.interpolate({ inputRange: [0, 1], outputRange: [(STAGE_HEIGHT - MIC_BLOCK) / 2, STAGE_HEIGHT - MIC_BLOCK] });
  const micScale = level.interpolate({ inputRange: [0, 1], outputRange: [1, 1.14] });
  return (
    <View style={styles.root}>
      <View style={[styles.stage, { height: STAGE_HEIGHT }]}>
        <Animated.View
          style={[styles.questions, { opacity: slide, bottom: MIC_BLOCK + theme.spacing.md }]}
          pointerEvents={stageOpen ? "auto" : "none"}
          testID="own-voice-questions"
        >
          <ScrollView showsVerticalScrollIndicator contentContainerStyle={styles.questionList}>
            {items.map((item, i) => (
              <Animated.Text
                key={item.key}
                style={[
                  styles.question,
                  { opacity: lines[i], transform: [{ translateY: lines[i].interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }] },
                ]}
              >
                {`${i + 1}. ${item.question}`}
              </Animated.Text>
            ))}
          </ScrollView>
        </Animated.View>

        <Animated.View style={[styles.micBlock, { top: micTop }]}>
          <View style={[styles.wave, { opacity: recordingNow ? 1 : 0 }]} testID="own-wave">
            {levels.map((value, i) => (
              <View key={i} style={[styles.bar, { height: 6 + value * 34 }]} />
            ))}
          </View>
          <Animated.View style={{ transform: [{ scale: micScale }] }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={recordingNow ? "Stop recording" : "Start recording"}
              onPress={() => void toggle()}
              disabled={phase === "reading"}
              style={[styles.mic, recordingNow && styles.micOn, phase === "reading" && styles.micOff]}
              testID="own-mic"
            >
              <Ionicons name={recordingNow ? "stop" : "mic"} size={42} color={theme.color.primaryText} />
            </Pressable>
          </Animated.View>
          <Text style={styles.status} testID="own-mic-status">
            {phase === "reading" ? "Reading what you said…" : recordingNow ? `${clock(elapsed)} of ${clock(MAX_RECORDING_MS)}` : "Tap to talk"}
          </Text>
        </Animated.View>
      </View>

      {problem ? <Banner tone="warning" body={problem} testID="own-voice-problem" /> : null}
      {phase === "idle" ? (
        <TextButton
          label="Or type it"
          onPress={() => {
            setProblem(null);
            setValues({});
            setPhase("form");
          }}
          testID="own-voice-type"
        />
      ) : null}
      <Text style={styles.note}>Your voice is sent to a speech-to-text service to make text. We don't keep the recording.</Text>
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    root: { gap: theme.spacing.md },
    stage: { position: "relative" },
    questions: { position: "absolute", top: 0, left: 0, right: 0 },
    questionList: { gap: theme.spacing.md, paddingVertical: theme.spacing.xs },
    question: { fontSize: 26, lineHeight: 34, fontWeight: theme.fontWeight.semibold, color: theme.color.text },
    micBlock: { position: "absolute", left: 0, right: 0, alignItems: "center", gap: theme.spacing.xs },
    wave: { height: 44, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4 },
    bar: { width: 5, borderRadius: 3, backgroundColor: theme.color.primary },
    mic: {
      width: MIC,
      height: MIC,
      borderRadius: MIC / 2,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.color.primary,
    },
    micOn: { backgroundColor: theme.color.error },
    micOff: { opacity: theme.opacity.disabled },
    status: { fontSize: 20, lineHeight: 28, color: theme.color.text, fontWeight: theme.fontWeight.semibold },
    heading: { fontSize: 24, lineHeight: 32, fontWeight: theme.fontWeight.semibold, color: theme.color.text },
    field: { gap: theme.spacing.xs },
    label: { fontSize: 22, lineHeight: 30, fontWeight: theme.fontWeight.semibold, color: theme.color.text },
    note: { fontSize: 18, lineHeight: 24, color: theme.color.textMuted },
  });
