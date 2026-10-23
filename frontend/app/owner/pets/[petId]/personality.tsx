import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { BigOption } from "../../../../components/ownerOnboarding/BigOption";
import { Button } from "../../../../components/ui/Button";
import { EmptyState } from "../../../../components/ui/EmptyState";
import { LoadingView } from "../../../../components/ui/LoadingView";
import { Screen } from "../../../../components/ui/Screen";
import { chartQuestions, fill } from "../../../../features/ownerOnboarding/questions";
import { parseProfile } from "../../../../features/ownerOnboarding/scoring";
import { getPet, savePersonality } from "../../../../features/pets/petApi";
import { useThemedStyles } from "../../../../providers/ThemeProvider";
import { useToast } from "../../../../providers/ToastProvider";
import { Theme } from "../../../../theme/themes";
import { Pet } from "../../../../types/db";

/** Answer the personality questions again for a saved pet (the same ones as sign-up). */
export default function PetPersonality() {
  const styles = useThemedStyles(makeStyles);
  const toast = useToast();
  const { petId } = useLocalSearchParams<{ petId: string }>();
  const [pet, setPet] = useState<Pet | null | undefined>(undefined);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void getPet(petId)
      .then((p) => {
        setPet(p);
        if (p) setAnswers(parseProfile(p.profile).answers);
      })
      .catch(() => setPet(null));
  }, [petId]);

  if (pet === undefined) return <LoadingView />;
  if (!pet) return <Screen><EmptyState emoji="🐾" title="Pet not found" message="It may have been removed." /></Screen>;

  const save = async () => {
    setSaving(true);
    try {
      await savePersonality(pet.id, answers);
      toast.show("Saved");
      router.back();
    } catch (e) {
      toast.show((e as Error).message);
      setSaving(false);
    }
  };

  return (
    <Screen>
      {chartQuestions(pet.species).map((q) => (
        <View key={q.key} style={styles.question}>
          <Text style={styles.prompt}>{fill(q.prompt, pet.name)}</Text>
          {q.options.map((label, i) => (
            <BigOption
              key={label}
              label={label}
              selected={answers[q.key] === i + 1}
              onPress={() => setAnswers((prev) => ({ ...prev, [q.key]: i + 1 }))}
              testID={`personality-${q.key}-${i + 1}`}
            />
          ))}
        </View>
      ))}
      <Button label="Save" onPress={() => void save()} disabled={saving} testID="personality-save" />
    </Screen>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    question: { gap: theme.spacing.sm },
    prompt: { fontSize: theme.fontSize.body, fontWeight: theme.fontWeight.semibold, color: theme.color.text },
  });
