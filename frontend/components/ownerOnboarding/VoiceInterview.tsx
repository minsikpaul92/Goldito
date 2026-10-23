import Ionicons from "@expo/vector-icons/Ionicons";
import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";

import { BigInput } from "./BigInput";
import { Banner } from "../ui/Banner";
import { Button } from "../ui/Button";
import { TextButton } from "../ui/TextButton";
import { MAX_RECORDING_MS, Recording, VoiceError, isVoiceSupported, startRecording } from "../../lib/voiceRecorder";
import { transcribeRecording } from "../../features/ownerOnboarding/voiceApi";
import { useTheme, useThemedStyles } from "../../providers/ThemeProvider";
import { Theme } from "../../theme/themes";

/** `hint`: what to think of when answering (shown small under the question and as the box's hint). */
export type InterviewItem = { key: string; question: string; placeholder?: string; hint?: string; multiline?: boolean };

type Props = {
  /** The questions, in the order they are read out and asked on the form. */
  items: InterviewItem[];
  /** The words said, read for an answer per item. Throws an Error whose message says what to do instead. */
  parse: (text: string) => Promise<Record<string, string>>;
  /** The answers the person kept, one text per item key. */
  onSubmit: (values: Record<string, string>) => void;
};

type Phase = "idle" | "recording" | "reading" | "transcript" | "parsing" | "form";

// The stage (mic, questions) takes what is left of the screen under the title and above the Back and Skip row, so
// the first view needs no scrolling: it shrinks on a short screen and never goes past 420.
const STAGE_MIN = 250;
const STAGE_MAX = 420;
const STAGE_CHROME = 388;
const MIC = 96;
// The mic with the waveform on both sides of it, and its status line.
const MIC_BLOCK = MIC + 40;
// "Or type it" hangs under the mic while it sits in the middle; the pair is centered together.
const TYPE_GAP = 16;
const TYPE_BUTTON = 48;
const BARS = 10;
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
  const { height: screenHeight } = useWindowDimensions();
  const stageHeight = Math.min(STAGE_MAX, Math.max(STAGE_MIN, screenHeight - STAGE_CHROME));
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
  // The questions list scrolls: its own scrollbar is drawn so it can be seen (the browser hides its bar until you scroll).
  const [scrollbar, setScrollbar] = useState({ offset: 0, content: 0, view: 0 });

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
              placeholder={item.placeholder ?? item.hint}
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
  const micTop = slide.interpolate({ inputRange: [0, 1], outputRange: [(stageHeight - MIC_BLOCK - TYPE_GAP - TYPE_BUTTON) / 2, stageHeight - MIC_BLOCK] });
  const micScale = level.interpolate({ inputRange: [0, 1], outputRange: [1, 1.14] });
  return (
    <View style={styles.root}>
      <View style={[styles.stage, { height: stageHeight }]}>
        <Animated.View
          style={[styles.questions, { opacity: slide, bottom: MIC_BLOCK + theme.spacing.md }]}
          pointerEvents={stageOpen ? "auto" : "none"}
          testID="own-voice-questions"
        >
          <View style={styles.listBox}>
            <ScrollView
              showsVerticalScrollIndicator={false}
              scrollEventThrottle={16}
              onScroll={(e) => setScrollbar((before) => ({ ...before, offset: e.nativeEvent.contentOffset.y }))}
              onContentSizeChange={(_w, content) => setScrollbar((before) => ({ ...before, content }))}
              onLayout={(e) => setScrollbar((before) => ({ ...before, view: e.nativeEvent.layout.height }))}
              contentContainerStyle={styles.questionList}
            >
              {items.map((item, i) => (
                <Animated.Text
                  key={item.key}
                  style={[
                    styles.question,
                    { opacity: lines[i], transform: [{ translateY: lines[i].interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }] },
                  ]}
                >
                  {`${i + 1}. ${item.question}`}
                {item.hint ? <Text style={styles.questionHint}>{`\n${item.hint}`}</Text> : null}
                </Animated.Text>
              ))}
            </ScrollView>
            {scrollbar.content > scrollbar.view + 1 && scrollbar.view > 0 ? (
              <View style={styles.track} testID="own-scrollbar">
                <View
                  style={[
                    styles.thumb,
                    {
                      height: Math.max(28, (scrollbar.view / scrollbar.content) * scrollbar.view),
                      top: (scrollbar.offset / (scrollbar.content - scrollbar.view)) * (scrollbar.view - Math.max(28, (scrollbar.view / scrollbar.content) * scrollbar.view)),
                    },
                  ]}
                />
              </View>
            ) : null}
          </View>
        </Animated.View>

        <Animated.View style={[styles.micBlock, { top: micTop }]}>
          <View style={styles.micRow}>
            <View style={[styles.wave, { opacity: recordingNow ? 1 : 0 }]} testID="own-wave">
              {levels.map((value, i) => (
                <View key={i} style={[styles.bar, { height: 6 + value * 40 }]} />
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
            <View style={[styles.wave, { opacity: recordingNow ? 1 : 0 }]}>
              {[...levels].reverse().map((value, i) => (
                <View key={i} style={[styles.bar, { height: 6 + value * 40 }]} />
              ))}
            </View>
          </View>
          <Text style={styles.status} testID="own-mic-status">
            {phase === "reading" ? "Reading what you said…" : recordingNow ? `${clock(elapsed)} of ${clock(MAX_RECORDING_MS)}` : "Tap to talk"}
          </Text>
          <Animated.View
            style={[styles.typeWrap, { opacity: slide.interpolate({ inputRange: [0, 0.4], outputRange: [1, 0], extrapolate: "clamp" }) }]}
            pointerEvents={phase === "idle" ? "auto" : "none"}
          >
            <Button
              label="Or type it"
              variant="secondary"
              onPress={() => {
                setProblem(null);
                setValues({});
                setPhase("form");
              }}
              style={styles.typeButton}
              testID="own-voice-type"
            />
          </Animated.View>
        </Animated.View>
      </View>

      {problem ? <Banner tone="warning" body={problem} testID="own-voice-problem" /> : null}
      <Text style={styles.note}>Your voice is sent to a speech-to-text service to make text. We don't keep the recording.</Text>
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    root: { gap: theme.spacing.md },
    stage: { position: "relative" },
    questions: { position: "absolute", top: 0, left: 0, right: 0 },
    listBox: { flex: 1 },
    questionList: { gap: theme.spacing.md, paddingVertical: theme.spacing.xs, paddingRight: theme.spacing.md + 6 },
    track: { position: "absolute", top: 0, bottom: 0, right: 0, width: 6, borderRadius: 3, backgroundColor: theme.color.track },
    thumb: { position: "absolute", left: 0, right: 0, borderRadius: 3, backgroundColor: theme.color.primary },
    questionHint: { fontSize: 17, lineHeight: 22, fontWeight: theme.fontWeight.regular, color: theme.color.textMuted },
    question: { fontSize: 26, lineHeight: 34, fontWeight: theme.fontWeight.semibold, color: theme.color.text },
    micBlock: { position: "absolute", left: 0, right: 0, alignItems: "center", gap: theme.spacing.xs },
    typeWrap: { position: "absolute", top: MIC_BLOCK + TYPE_GAP, left: 0, right: 0, alignItems: "center" },
    typeButton: { minHeight: TYPE_BUTTON, paddingHorizontal: theme.spacing.lg },
    micRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: theme.spacing.md },
    wave: { width: 80, height: MIC, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4 },
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
    note: { fontSize: 13, lineHeight: 18, color: theme.color.textMuted },
  });
