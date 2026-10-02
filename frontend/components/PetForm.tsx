import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Button } from "./ui/Button";
import { Chip } from "./ui/Chip";
import { SegmentedControl } from "./ui/SegmentedControl";
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

/** Pet profile fields for Add pet and Pet profile (phase-03 3.5). Owners may type here. */
export function PetForm({ initial, editing, submitLabel, onSubmit }: Props) {
  const styles = useThemedStyles(makeStyles);
  const [values, setValues] = useState<PetFormValues>(initial);
  const [errors, setErrors] = useState<PetFormErrors>({});
  const [allergyDraft, setAllergyDraft] = useState("");
  const [allergyError, setAllergyError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function set<K extends keyof PetFormValues>(key: K, value: PetFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
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
    setAllergyDraft("");
    setAllergyError(null);
  }

  async function submit() {
    const { errors: found, input } = validatePet(values);
    setErrors(found);
    if (!input) return;
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
    <View style={styles.form}>
      <View style={styles.field}>
        <Text style={styles.label}>Species</Text>
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
        {editing ? <Text style={styles.hint}>Species can't be changed after the pet is added.</Text> : null}
        {errors.species ? <Text style={styles.error}>{errors.species}</Text> : null}
      </View>

      <TextField
        label="Name"
        value={values.name}
        onChangeText={(text) => set("name", text)}
        placeholder="Max"
        error={errors.name}
        testID="pet-name"
      />
      <TextField
        label="Breed (optional)"
        value={values.breed}
        onChangeText={(text) => set("breed", text)}
        placeholder={values.species === "cat" ? "Domestic Shorthair" : "Maltese"}
        testID="pet-breed"
      />
      <TextField
        label="Birthday (optional)"
        value={values.birthdate}
        onChangeText={(text) => set("birthdate", text)}
        placeholder="YYYY-MM-DD"
        inputMode="numeric"
        error={errors.birthdate}
        testID="pet-birthdate"
      />
      <TextField
        label="Weight in kg (optional)"
        value={values.weight}
        onChangeText={(text) => set("weight", text)}
        placeholder="3.2"
        inputMode="decimal"
        keyboardType="decimal-pad"
        error={errors.weight}
        testID="pet-weight"
      />

      <View style={styles.field}>
        <Text style={styles.label}>Allergies</Text>
        <Text style={styles.hint}>The treat scanner checks labels against these.</Text>
        {values.allergens.length > 0 ? (
          <View style={styles.chips}>
            {values.allergens.map((allergen) => (
              <Chip
                key={allergen}
                label={allergen}
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
              value={allergyDraft}
              onChangeText={(text) => {
                setAllergyDraft(text);
                setAllergyError(null);
              }}
              onSubmitEditing={addAllergy}
              placeholder="chicken"
              autoCapitalize="none"
              error={allergyError}
              testID="pet-allergy-input"
            />
          </View>
          <TextButton label="Add" onPress={addAllergy} testID="pet-allergy-add" />
        </View>
      </View>

      <TextField
        label="Notes (optional)"
        value={values.notes}
        onChangeText={(text) => set("notes", text)}
        placeholder="Shy with strangers, loves belly rubs"
        multiline
        testID="pet-notes"
      />

      {saveError ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {saveError}
        </Text>
      ) : null}
      <Button label={saving ? "Saving…" : submitLabel} onPress={() => void submit()} disabled={saving} testID="pet-save" />
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    form: {
      gap: theme.spacing.md,
    },
    field: {
      gap: theme.spacing.xs,
    },
    label: {
      fontSize: theme.fontSize.small,
      fontWeight: "600",
      color: theme.color.textMuted,
    },
    hint: {
      fontSize: theme.fontSize.small,
      color: theme.color.textMuted,
    },
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
      alignItems: "flex-end",
      gap: theme.spacing.sm,
    },
    allergyInput: {
      flex: 1,
    },
  });
