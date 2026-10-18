import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { loadDraft } from "../features/onboarding/onboardingApi";
import { OnboardingDraft, QUESTIONS, availabilitySummary, choiceLabel } from "../features/onboarding/questions";
import { useThemedStyles } from "../providers/ThemeProvider";
import { Theme } from "../theme/themes";

/** What the sitter saved in onboarding, read only. Unanswered questions are left out. */
export function SitterAnswersSummary({ sitterId }: { sitterId: string }) {
  const styles = useThemedStyles(makeStyles);
  const [draft, setDraft] = useState<OnboardingDraft | null>(null);

  useEffect(() => {
    let active = true;
    loadDraft(sitterId)
      .then((d) => active && setDraft(d))
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [sitterId]);

  if (!draft) return null;
  const rows = QUESTIONS.flatMap((q, i) => {
    const a = draft.answers[q.key];
    const text = [choiceLabel(q, a?.choice), a?.answer.trim()].filter(Boolean).join(" · ");
    return text ? [{ key: q.key, prompt: `${i + 1}. ${q.prompt}`, text }] : [];
  });
  for (const [i, c] of draft.custom.entries()) {
    if (c.question.trim() && c.answer.trim()) rows.push({ key: `custom-${i}`, prompt: c.question.trim(), text: c.answer.trim() });
  }
  if (draft.availability.rules.length > 0) {
    rows.push({ key: "availability", prompt: "When you can host", text: availabilitySummary(draft.availability) });
  }
  if (rows.length === 0) return null;

  return (
    <View style={styles.list} testID="profile-answers-list">
      {rows.map((row) => (
        <View key={row.key} style={styles.row}>
          <Text style={styles.prompt}>{row.prompt}</Text>
          <Text style={styles.answer}>{row.text}</Text>
        </View>
      ))}
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    list: { gap: theme.spacing.sm },
    row: { gap: 2 },
    prompt: { fontSize: theme.fontSize.small, lineHeight: theme.lineHeight.small, color: theme.color.textMuted },
    answer: { fontSize: theme.fontSize.body, lineHeight: theme.lineHeight.body, color: theme.color.text },
  });
