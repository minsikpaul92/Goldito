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
    return text ? [{ key: q.key, n: i + 1 as number | null, prompt: q.prompt, text }] : [];
  });
  for (const [i, c] of draft.custom.entries()) {
    if (c.question.trim() && c.answer.trim()) rows.push({ key: `custom-${i}`, n: null, prompt: c.question.trim(), text: c.answer.trim() });
  }
  if (draft.availability.rules.length > 0) {
    rows.push({ key: "availability", n: null, prompt: "When you can host", text: availabilitySummary(draft.availability) });
  }
  if (rows.length === 0) return null;

  return (
    <View style={styles.list} testID="profile-answers-list">
      {rows.map((row) => (
        <View key={row.key} style={styles.row}>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{row.n ?? "✓"}</Text>
          </View>
          <View style={styles.texts}>
            <Text style={styles.prompt}>{row.prompt}</Text>
            <View style={styles.answerBox}>
              <Text style={styles.answer}>{row.text}</Text>
            </View>
          </View>
        </View>
      ))}
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    list: { gap: theme.spacing.sm },
    row: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: theme.spacing.sm,
      padding: theme.spacing.md,
      borderRadius: theme.ui.radius.card,
      backgroundColor: theme.color.blockMint,
    },
    badge: {
      width: 24,
      height: 24,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.color.primary,
    },
    badgeText: { fontSize: theme.fontSize.small, fontWeight: theme.fontWeight.bold, color: theme.color.primaryText },
    texts: { flex: 1, gap: theme.spacing.xs },
    answerBox: {
      padding: theme.spacing.sm,
      borderRadius: theme.radius.md,
      backgroundColor: theme.color.surface,
      borderWidth: 1,
      borderColor: theme.color.border,
    },
    prompt: { fontSize: theme.fontSize.small, lineHeight: theme.lineHeight.small, color: theme.color.textMuted },
    answer: { fontSize: theme.fontSize.body, lineHeight: theme.lineHeight.body, color: theme.color.text },
  });
