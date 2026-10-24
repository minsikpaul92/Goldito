import { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { ClosingRulesSheet } from "./ClosingRulesSheet";
import { BigInput } from "./ownerOnboarding/BigInput";
import { BigOption } from "./ownerOnboarding/BigOption";
import { StepFrame } from "./ownerOnboarding/StepFrame";
import { VoiceStep } from "./ownerOnboarding/VoiceStep";
import { Button } from "./ui/Button";
import { Screen } from "./ui/Screen";
import { TextButton } from "./ui/TextButton";
import { TextField } from "./ui/TextField";
import {
  AnswerDraft,
  MAX_ANSWER,
  MAX_CUSTOM,
  MAX_INTRO,
  MAX_QUESTION,
  OnboardingDraft,
  QUESTIONS,
  answeredCount,
  availabilitySummary,
  choiceLabel,
  choiceList,
} from "../features/onboarding/questions";
import { extractSitterAnswers } from "../features/onboarding/voiceApi";
import { useThemedStyles } from "../providers/ThemeProvider";
import { Theme } from "../theme/themes";

type Props = {
  draft: OnboardingDraft;
  onChange: (draft: OnboardingDraft) => void;
  /** Leaving every question empty and finishing. Only offered the first time. */
  onSkipAll?: () => void;
  onFinish: () => void;
  saving: boolean;
};

const PICK_DELAY_MS = 200;
// The screens in order: voice, the numbered questions, then the extras, then the check.
const STEPS = ["voice", ...QUESTIONS.map((q) => `q:${q.key}`), "custom", "availability", "intro", "review"];

/**
 * Sitter onboarding (3D.2, #139): one question per screen in large text. A pick goes on by itself; a question that
 * takes several picks, or has a note open, waits for Next. Every question has Skip and a "+" for a note. The first
 * screen takes the answers by voice (or typing): what the sitter says is suggested on the questions, never final.
 */
export function SitterAnswersForm({ draft, onChange, onSkipAll, onFinish, saving }: Props) {
  const styles = useThemedStyles(makeStyles);
  const [step, setStep] = useState("voice");
  const [rulesOpen, setRulesOpen] = useState(false);
  const [rulesKey, setRulesKey] = useState(0);
  const [openNotes, setOpenNotes] = useState<Set<string>>(
    () => new Set(QUESTIONS.filter((q) => (draft.answers[q.key]?.answer ?? "").trim() !== "").map((q) => q.key)),
  );
  // What the voice filled in and has not been touched since: key to the words it came from.
  const [heard, setHeard] = useState<Record<string, string>>({});
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const index = STEPS.indexOf(step);
  const go = (id: string) => setStep(id);
  const next = () => go(STEPS[Math.min(STEPS.length - 1, STEPS.indexOf(step) + 1)]);
  const back = index > 0 ? () => go(STEPS[index - 1]) : undefined;
  const progress = index / (STEPS.length - 1);

  const setAnswer = (key: string, patch: Partial<AnswerDraft>) => {
    onChange({
      ...draft,
      answers: { ...draft.answers, [key]: { ...(draft.answers[key] ?? { answer: "", choice: null }), ...patch } },
    });
    setHeard((h) => {
      if (!(key in h)) return h;
      const { [key]: _gone, ...rest } = h;
      return rest;
    });
  };

  const nextButton = <Button label="Next" onPress={next} testID="onboarding-next" />;

  if (step === "voice") {
    const read = async (text: string) => {
      setVoiceBusy(true);
      setVoiceError(null);
      try {
        const picks = await extractSitterAnswers(text);
        const answers = { ...draft.answers };
        const said: Record<string, string> = {};
        for (const [key, pick] of Object.entries(picks)) {
          // Only a question that is still empty is filled; the sitter's own picks stay.
          if (!QUESTIONS.some((q) => q.key === key) || answers[key]?.choice) continue;
          answers[key] = { answer: answers[key]?.answer ?? "", choice: pick.value };
          said[key] = pick.quote;
        }
        onChange({ ...draft, answers });
        setHeard(said);
        go(`q:${QUESTIONS[0].key}`);
      } catch (e) {
        setVoiceError((e as Error).message);
      } finally {
        setVoiceBusy(false);
      }
    };
    return (
      <StepFrame
        progress={0}
        title="Tell us how you look after pets"
        hint="Say it in your own words, or type it."
        onSkip={next}
        skipTestID="onboarding-skip"
        footer={
          onSkipAll ? <TextButton label="Skip all for now" onPress={onSkipAll} disabled={saving} testID="onboarding-skip-all" /> : undefined
        }
        testID="onboarding-step-voice"
      >
        <VoiceStep placeholder="How many pets, which dogs, walks, meals…" onUse={read} error={voiceError} busy={voiceBusy} />
      </StepFrame>
    );
  }

  if (step.startsWith("q:")) {
    const q = QUESTIONS.find((x) => `q:${x.key}` === step);
    if (!q) return null;
    const a = draft.answers[q.key];
    const picked = choiceList(a?.choice);
    const noteOpen = openNotes.has(q.key);
    const answered = picked.length > 0 || (a?.answer ?? "").trim() !== "";
    const choose = (value: string) => {
      const on = picked.includes(value);
      // Several picks are kept in the order of the options, whatever order they were tapped in.
      const nextPicked = q.multi
        ? (q.choices ?? []).map((c) => c.value).filter((v) => (v === value ? !on : picked.includes(v)))
        : on
          ? []
          : [value];
      setAnswer(q.key, { choice: nextPicked.length ? nextPicked.join(",") : null });
      // One pick goes on by itself, unless a note is open or this tap cleared it (Next is there when it does not).
      if (!q.multi && !noteOpen && nextPicked.length > 0) {
        if (timer.current) clearTimeout(timer.current);
        // Only if the sitter is still on this screen: a Skip or Back in the meantime is not undone.
        const from = step;
        timer.current = setTimeout(() => setStep((cur) => (cur === from ? STEPS[Math.min(STEPS.length - 1, STEPS.indexOf(from) + 1)] : cur)), PICK_DELAY_MS);
      }
    };
    return (
      <StepFrame
        progress={progress}
        title={q.prompt}
        hint={q.multi ? "Pick all that fit." : undefined}
        onBack={back}
        onSkip={next}
        skipTestID="onboarding-skip"
        footer={answered ? nextButton : undefined}
        testID={`onboarding-q-${q.key}`}
      >
        {heard[q.key] ? (
          <Text style={styles.heard} testID={`onboarding-heard-${q.key}`}>{`You said: “${heard[q.key]}”`}</Text>
        ) : null}
        {(q.choices ?? []).map((c) => (
          <BigOption
            key={c.value}
            label={c.label}
            selected={picked.includes(c.value)}
            badge={heard[q.key] && picked.includes(c.value) ? "Suggested" : undefined}
            onPress={() => choose(c.value)}
            testID={`onboarding-choice-${q.key}-${c.value}`}
          />
        ))}
        {noteOpen ? (
          <BigInput
            value={a?.answer ?? ""}
            onChangeText={(text) => setAnswer(q.key, { answer: text })}
            maxLength={MAX_ANSWER}
            multiline
            placeholder="Add a note"
            accessibilityLabel="Note"
            testID={`onboarding-note-${q.key}`}
          />
        ) : null}
        <TextButton
          label={noteOpen ? "Hide note" : "+ Add a note"}
          onPress={() =>
            setOpenNotes((open) => {
              const nextOpen = new Set(open);
              if (!nextOpen.delete(q.key)) nextOpen.add(q.key);
              return nextOpen;
            })
          }
          testID={`onboarding-note-toggle-${q.key}`}
        />
      </StepFrame>
    );
  }

  if (step === "custom") {
    return (
      <StepFrame
        progress={progress}
        title="Your own questions"
        hint="Anything owners should know that we did not ask."
        onBack={back}
        footer={
          <>
            {nextButton}
          </>
        }
        testID="onboarding-custom"
      >
        {draft.custom.map((c, i) => (
          <View key={i} style={styles.custom}>
            <TextField
              label={`Question ${i + 1}`}
              value={c.question}
              onChangeText={(text) => onChange({ ...draft, custom: draft.custom.map((x, j) => (j === i ? { ...x, question: text } : x)) })}
              maxLength={MAX_QUESTION}
              testID={`onboarding-custom-q-${i}`}
            />
            <TextField
              label="Your answer"
              value={c.answer}
              onChangeText={(text) => onChange({ ...draft, custom: draft.custom.map((x, j) => (j === i ? { ...x, answer: text } : x)) })}
              maxLength={MAX_ANSWER}
              multiline
              testID={`onboarding-custom-a-${i}`}
            />
            <TextButton
              label="Remove"
              onPress={() => onChange({ ...draft, custom: draft.custom.filter((_, j) => j !== i) })}
              testID={`onboarding-custom-remove-${i}`}
            />
          </View>
        ))}
        {draft.custom.length < MAX_CUSTOM ? (
          <Button
            label="Add a question"
            variant="secondary"
            onPress={() => onChange({ ...draft, custom: [...draft.custom, { question: "", answer: "" }] })}
            testID="onboarding-custom-add"
          />
        ) : null}
      </StepFrame>
    );
  }

  if (step === "availability") {
    const { availability } = draft;
    return (
      <StepFrame progress={progress} title="When can you host?" onBack={back} footer={nextButton} testID="onboarding-availability">
        <Text style={styles.answer} testID="onboarding-availability-summary">
          {availabilitySummary(availability)}
        </Text>
        <Button
          label="Set weekly availability"
          variant="secondary"
          onPress={() => {
            setRulesKey((k) => k + 1);
            setRulesOpen(true);
          }}
          testID="onboarding-availability-open"
        />
        <ClosingRulesSheet
          key={rulesKey}
          visible={rulesOpen}
          rules={availability.rules}
          hours={availability.hours}
          weekdayHours={availability.weekdayHours}
          saving={false}
          error={null}
          onApply={(rules, hours, weekdayHours) => {
            onChange({ ...draft, availability: { touched: true, rules, hours, weekdayHours } });
            setRulesOpen(false);
          }}
          onClose={() => setRulesOpen(false)}
        />
      </StepFrame>
    );
  }

  if (step === "intro") {
    return (
      <StepFrame
        progress={progress}
        title="A few words about you"
        hint="Optional. Owners read this."
        onBack={back}
        footer={<Button label="Review" onPress={() => go("review")} testID="onboarding-review" />}
        testID="onboarding-step-intro"
      >
        <BigInput
          value={draft.intro}
          onChangeText={(text) => onChange({ ...draft, intro: text })}
          maxLength={MAX_INTRO}
          multiline
          accessibilityLabel="About you"
          testID="onboarding-intro"
        />
      </StepFrame>
    );
  }

  return <Review draft={draft} onBack={() => go("intro")} onFinish={onFinish} saving={saving} />;
}

function Review({
  draft,
  onBack,
  onFinish,
  saving,
}: {
  draft: OnboardingDraft;
  onBack: () => void;
  onFinish: () => void;
  saving: boolean;
}) {
  const styles = useThemedStyles(makeStyles);
  const answered = QUESTIONS.map((q, i) => ({ q, n: i + 1, a: draft.answers[q.key] })).filter(
    (x) => x.a && (x.a.answer.trim() || x.a.choice),
  );
  const customs = draft.custom.filter((c) => c.question.trim() && c.answer.trim());
  const skipped = QUESTIONS.length - answeredCount(draft);

  return (
    <Screen contentStyle={styles.form} testID="onboarding-review-step">
      <Text style={styles.title}>Check your answers</Text>

      {answered.map(({ q, n, a }) => (
        <View key={q.key} style={styles.reviewRow} testID={`onboarding-review-${q.key}`}>
          <Text style={styles.prompt}>
            {n}. {q.prompt}
          </Text>
          <Text style={styles.answer}>{[choiceLabel(q, a?.choice), a?.answer.trim()].filter(Boolean).join(" · ")}</Text>
        </View>
      ))}
      {customs.map((c, i) => (
        <View key={i} style={styles.reviewRow}>
          <Text style={styles.prompt}>{c.question.trim()}</Text>
          <Text style={styles.answer}>{c.answer.trim()}</Text>
        </View>
      ))}
      {draft.availability.touched ? (
        <View style={styles.reviewRow} testID="onboarding-review-availability">
          <Text style={styles.prompt}>When you can host</Text>
          <Text style={styles.answer}>{availabilitySummary(draft.availability)}</Text>
        </View>
      ) : null}
      {draft.intro.trim() ? (
        <View style={styles.reviewRow} testID="onboarding-review-intro">
          <Text style={styles.prompt}>About you</Text>
          <Text style={styles.answer}>{draft.intro.trim()}</Text>
        </View>
      ) : null}
      {answered.length === 0 && customs.length === 0 && !draft.intro.trim() && !draft.availability.touched ? (
        <Text style={styles.muted}>Nothing answered yet.</Text>
      ) : skipped > 0 ? (
        <Text style={styles.muted} testID="onboarding-skipped">
          {skipped} skipped
        </Text>
      ) : null}

      <Button label="Finish" onPress={onFinish} disabled={saving} testID="onboarding-finish" />
      <Button label="Back to edit" variant="secondary" onPress={onBack} disabled={saving} testID="onboarding-back" />
    </Screen>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    form: { gap: theme.spacing.md },
    title: { fontSize: theme.fontSize.title, lineHeight: theme.lineHeight.title, fontWeight: theme.fontWeight.bold, color: theme.color.text },
    muted: { fontSize: theme.fontSize.small, lineHeight: theme.lineHeight.small, color: theme.color.textMuted },
    prompt: { fontSize: theme.fontSize.body, lineHeight: theme.lineHeight.body, fontWeight: theme.fontWeight.semibold, color: theme.color.text },
    custom: { gap: theme.spacing.sm },
    reviewRow: { gap: theme.spacing.xs },
    answer: { fontSize: 18, lineHeight: 24, color: theme.color.text },
    heard: { fontSize: 18, lineHeight: 24, color: theme.color.primary },
  });
