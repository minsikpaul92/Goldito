import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Button } from "./ui/Button";
import { Chip } from "./ui/Chip";
import { Field } from "./ui/Field";
import { Screen } from "./ui/Screen";
import { SegmentedControl } from "./ui/SegmentedControl";
import { Stack } from "./ui/Stack";
import { TextButton } from "./ui/TextButton";
import { TextField } from "./ui/TextField";
import { PetInput } from "../features/pets/petApi";
import {
  MAX_ALLERGEN_LENGTH,
  PetFormErrors,
  PetFormValues,
  normalizeAllergen,
  validatePet,
} from "../features/pets/petValidation";
import { useThemedStyles } from "../providers/ThemeProvider";
import { Species } from "../types/db";
import { Theme } from "../theme/themes";

type Props = {
  initial: PetFormValues;
  /** Editing an existing pet: species is locked (D22). */
  editing: boolean;
  submitLabel: string;
  onSubmit: (input: PetInput) => Promise<void>;
};

/** Add pet / Pet profile screen body (phase-03 3.5): fields, with Save pinned in the footer. Owners may type here. */
export function PetForm({ initial, editing, submitLabel, onSubmit }: Props) {
  const styles = useThemedStyles(makeStyles);
  const [values, setValues] = useState<PetFormValues>(initial);
  const [errors, setErrors] = useState<PetFormErrors>({});
  const [allergyDraft, setAllergyDraft] = useState("");
  const [allergyError, setAllergyError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [justAdded, setJustAdded] = useState<string | null>(null);

  function set<K extends keyof PetFormValues>(key: K, value: PetFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
    // The error goes away as soon as the owner edits that field.
    setErrors((prev) => (key in prev ? { ...prev, [key]: undefined } : prev));
  }

  function addAllergy() {
    const allergen = normalizeAllergen(allergyDraft);
    if (!allergen) return;
    if (allergen.length > MAX_ALLERGEN_LENGTH) {
      setAllergyError(`Keep it under ${MAX_ALLERGEN_LENGTH} characters.`);
      return;
    }
    if (values.allergens.includes(allergen)) {
      setAllergyError(`${allergen} is already on the list.`);
      return;
    }
    set("allergens", [...values.allergens, allergen]);
    setJustAdded(allergen);
    setAllergyDraft("");
    setAllergyError(null);
  }

  async function submit() {
    const { errors: found, input } = validatePet(values);
    setErrors(found);
    if (!input) {
      setAttempt((n) => n + 1);
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      await onSubmit(input);
    } catch (error) {
      setSaveError((error as Error).message);
      setSaving(false);
    }
  }

  return (
    <Screen
      footer={
        <>
          {saveError ? (
            <Text accessibilityRole="alert" style={styles.error}>
              {saveError}
            </Text>
          ) : null}
          <Button label={submitLabel} onPress={() => void submit()} loading={saving} testID="pet-save" />
        </>
      }
    >
      <Stack gap="md">
        <Field
          label="Species"
          hint={editing ? "Species can't be changed after the pet is added." : null}
          error={errors.species}
          shakeKey={attempt}
        >
          <SegmentedControl<Species>
            options={[
              { value: "dog", label: "🐶 Dog" },
              { value: "cat", label: "🐱 Cat" },
            ]}
            value={values.species}
            onChange={(species) => set("species", species)}
            disabled={editing}
            testID="pet-species"
          />
        </Field>

        <TextField
          label="Name"
          value={values.name}
          onChangeText={(text) => set("name", text)}
          placeholder="e.g. Max"
          error={errors.name}
          shakeKey={attempt}
          testID="pet-name"
        />
        <TextField
          label="Breed (optional)"
          value={values.breed}
          onChangeText={(text) => set("breed", text)}
          placeholder={values.species === "cat" ? "e.g. Domestic Shorthair" : "e.g. Maltese"}
          testID="pet-breed"
        />
        <TextField
          label="Birthday (optional)"
          value={values.birthdate}
          onChangeText={(text) => set("birthdate", text)}
          placeholder="YYYY-MM-DD, e.g. 2022-04-15"
          inputMode="numeric"
          error={errors.birthdate}
          shakeKey={attempt}
          testID="pet-birthdate"
        />
        <TextField
          label="Weight in kg (optional)"
          value={values.weight}
          onChangeText={(text) => set("weight", text)}
          placeholder="e.g. 3.2"
          inputMode="decimal"
          keyboardType="decimal-pad"
          error={errors.weight}
          shakeKey={attempt}
          testID="pet-weight"
        />

        <Field label="Allergies" hint="The treat scanner checks labels against these.">
          {values.allergens.length > 0 ? (
            <View style={styles.chips}>
              {values.allergens.map((allergen) => (
                <Chip
                  key={allergen}
                  label={allergen}
                  justAdded={allergen === justAdded}
                  onRemove={() => set("allergens", values.allergens.filter((a) => a !== allergen))}
                  testID={`allergy-${allergen}`}
                />
              ))}
            </View>
          ) : null}
          <View style={styles.allergyRow}>
            <View style={styles.allergyInput}>
              <TextField
                label="Add an allergy"
                hideLabel
                value={allergyDraft}
                onChangeText={(text) => {
                  setAllergyDraft(text);
                  setAllergyError(null);
                }}
                onSubmitEditing={addAllergy}
                placeholder="Add an allergy, e.g. chicken"
                autoCapitalize="none"
                error={allergyError}
                testID="pet-allergy-input"
              />
            </View>
            <TextButton label="Add" onPress={addAllergy} testID="pet-allergy-add" />
          </View>
        </Field>

        <TextField
          label="Notes (optional)"
          value={values.notes}
          onChangeText={(text) => set("notes", text)}
          placeholder="e.g. Shy with strangers, loves belly rubs"
          multiline
          testID="pet-notes"
        />
      </Stack>
    </Screen>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    error: {
      fontSize: theme.fontSize.small,
      color: theme.color.error,
    },
    chips: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: theme.spacing.sm,
      paddingVertical: theme.spacing.xs,
    },
    allergyRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: theme.spacing.sm,
    },
    allergyInput: {
      flex: 1,
    },
  });
