import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { ClosingRulesSheet } from "./ClosingRulesSheet";
import { Button } from "./ui/Button";
import { ChoiceChips } from "./ui/ChoiceChips";
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

/**
 * Sitter onboarding, typed version (3D.2, #139): a numbered list, a note box (and chips) under each question, then a
 * review step before anything is saved. Every question can be skipped. The voice version fills these same fields later.
 */
export function SitterAnswersForm({ draft, onChange, onSkipAll, onFinish, saving }: Props) {
  const styles = useThemedStyles(makeStyles);
  const [step, setStep] = useState<"answer" | "review">("answer");
  const [rulesOpen, setRulesOpen] = useState(false);
  const [rulesKey, setRulesKey] = useState(0);
  // A note stays hidden behind a "+" until it is opened, or when the question already has one.
  const [openNotes, setOpenNotes] = useState<Set<string>>(
    () => new Set(QUESTIONS.filter((q) => (draft.answers[q.key]?.answer ?? "").trim() !== "").map((q) => q.key)),
  );

  const setAnswer = (key: string, patch: Partial<AnswerDraft>) =>
    onChange({
      ...draft,
      answers: { ...draft.answers, [key]: { ...(draft.answers[key] ?? { answer: "", choice: null }), ...patch } },
    });

  if (step === "review") return <Review draft={draft} onBack={() => setStep("answer")} onFinish={onFinish} saving={saving} />;

  const { availability } = draft;

  return (
    <View style={styles.form} testID="onboarding-form">
      <Text style={styles.title}>A few questions about you</Text>

      {QUESTIONS.map((q, i) => {
        const a = draft.answers[q.key];
        return (
          <View key={q.key} style={styles.question} testID={`onboarding-q-${q.key}`}>
            <Text style={styles.prompt}>
              {i + 1}. {q.prompt}
            </Text>
            {q.choices ? (
              <ChoiceChips
                options={q.choices}
                multi={q.multi}
                value={choiceList(a?.choice)}
                onChange={(v) => setAnswer(q.key, { choice: v.length ? v.join(",") : null })}
                testID={`onboarding-choice-${q.key}`}
              />
            ) : null}
            {openNotes.has(q.key) ? (
              <TextField
                label="Note"
                value={a?.answer ?? ""}
                onChangeText={(text) => setAnswer(q.key, { answer: text })}
                maxLength={MAX_ANSWER}
                multiline
                testID={`onboarding-note-${q.key}`}
              />
            ) : (
              <TextButton
                label="+ Note"
                onPress={() => setOpenNotes((open) => new Set(open).add(q.key))}
                style={styles.noteButton}
                testID={`onboarding-note-add-${q.key}`}
              />
            )}
          </View>
        );
      })}

      <View style={styles.question} testID="onboarding-custom">
        <Text style={styles.prompt}>Your own questions</Text>
        {draft.custom.map((c, i) => (
          <View key={i} style={styles.custom}>
            <TextField
              label={`Question ${i + 1}`}
              value={c.question}
              onChangeText={(text) =>
                onChange({ ...draft, custom: draft.custom.map((x, j) => (j === i ? { ...x, question: text } : x)) })
              }
              maxLength={MAX_QUESTION}
              testID={`onboarding-custom-q-${i}`}
            />
            <TextField
              label="Your answer"
              value={c.answer}
              onChangeText={(text) =>
                onChange({ ...draft, custom: draft.custom.map((x, j) => (j === i ? { ...x, answer: text } : x)) })
              }
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
      </View>

      <View style={styles.question} testID="onboarding-availability">
        <Text style={styles.prompt}>When can you host?</Text>
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
      </View>

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
      <View style={styles.question}>
        <TextField
          label="A few words about you (optional)"
          value={draft.intro}
          onChangeText={(text) => onChange({ ...draft, intro: text })}
          maxLength={MAX_INTRO}
          multiline
          testID="onboarding-intro"
        />
      </View>

      <Button label="Review" onPress={() => setStep("review")} testID="onboarding-review" />
      {onSkipAll ? <TextButton label="Skip all for now" onPress={onSkipAll} disabled={saving} testID="onboarding-skip-all" /> : null}
    </View>
  );
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
    <View style={styles.form} testID="onboarding-review-step">
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
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    form: { gap: theme.spacing.md },
    title: { fontSize: theme.fontSize.title, lineHeight: theme.lineHeight.title, fontWeight: theme.fontWeight.bold, color: theme.color.text },
    muted: { fontSize: theme.fontSize.small, lineHeight: theme.lineHeight.small, color: theme.color.textMuted },
    question: { gap: theme.spacing.sm },
    prompt: { fontSize: theme.fontSize.body, lineHeight: theme.lineHeight.body, fontWeight: theme.fontWeight.semibold, color: theme.color.text },
    custom: { gap: theme.spacing.sm },
    reviewRow: { gap: theme.spacing.xs },
    noteButton: { alignSelf: "flex-start" },
    answer: { fontSize: theme.fontSize.body, lineHeight: theme.lineHeight.body, color: theme.color.text },
  });
