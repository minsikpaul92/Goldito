import Ionicons from "@expo/vector-icons/Ionicons";
import { Redirect, router } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { BigInput } from "../components/ownerOnboarding/BigInput";
import { BigOption } from "../components/ownerOnboarding/BigOption";
import { PetGlanceCard } from "../components/PetGlanceCard";
import { PetPhotosStep } from "../components/ownerOnboarding/PetPhotosStep";
import { VoiceStep } from "../components/ownerOnboarding/VoiceStep";
import { StepFrame } from "../components/ownerOnboarding/StepFrame";
import { AddressInput } from "../components/AddressInput";
import { Banner } from "../components/ui/Banner";
import { Button } from "../components/ui/Button";
import { LoadingView } from "../components/ui/LoadingView";
import { Stepper } from "../components/ui/Stepper";
import { TextButton } from "../components/ui/TextButton";
import {
  EMPTY_DRAFT,
  OwnerOnboardingDraft,
  birthdateFromAge,
  clearDraft,
  foodsFromDraft,
  loadDraft,
  profileFromDraft,
  saveDraft,
  weightFromDraft,
} from "../features/ownerOnboarding/draft";
import { applyVoiceFacts } from "../features/ownerOnboarding/applyVoice";
import { useBreedNeeds } from "../features/ownerOnboarding/breedNeedsApi";
import { guessFromPhoto } from "../features/ownerOnboarding/photoGuessApi";
import { NO_FACTS, extractFacts, openQuestions } from "../features/ownerOnboarding/voiceApi";
import { markOwnerOnboarded, newPetId, saveOwnerOnboarding } from "../features/ownerOnboarding/ownerOnboardingApi";
import {
  COATS,
  FOOD_CHIPS,
  SAFETY_QUESTIONS,
  Score,
  chartQuestions,
  fill,
} from "../features/ownerOnboarding/questions";
import { glanceFacts } from "../features/ownerOnboarding/petGlanceApi";
import { progress, stepIds, stepIndex } from "../features/ownerOnboarding/steps";
import { normalizeAllergen } from "../features/pets/petValidation";
import { LocationError, getCurrentPosition } from "../lib/location";
import { useSession } from "../providers/SessionProvider";
import { useTheme, useThemedStyles } from "../providers/ThemeProvider";
import { useToast } from "../providers/ToastProvider";
import { Theme } from "../theme/themes";
import type { Species } from "../types/db";

/** Shown once to a new owner (owner_profiles.onboarded_at is null, 014v): their first pet, one question per screen. */
const PICK_DELAY_MS = 200;
const MAX_NAME = 40;
const MAX_PET_INTRO = 200;
const MAX_OWNER_INTRO = 500;

export default function OwnerOnboarding() {
  const session = useSession();
  const toast = useToast();
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const userId = session.status === "signedIn" ? session.profile.id : null;
  const [draft, setDraft] = useState<OwnerOnboardingDraft | null>(null);
  // Editing one answer from the summary returns to the summary instead of going on.
  const [fromSummary, setFromSummary] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationNote, setLocationNote] = useState<string | null>(null);
  const [otherFood, setOtherFood] = useState("");
  const [showOtherFood, setShowOtherFood] = useState(false);
  // On the summary the card also shows what the typed breed needs (it fills in a moment after).
  const needs = useBreedNeeds(draft?.species ?? null, draft && draft.step === "summary" ? draft.breed : null);
  const pickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Cover photos a guess was already asked for, so a photo is looked at once.
  const guessed = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!userId) return;
    let active = true;
    void loadDraft(userId).then((d) => active && setDraft(d));
    return () => {
      active = false;
      if (pickTimer.current) clearTimeout(pickTimer.current);
    };
  }, [userId]);

  const update = useCallback(
    (patch: Partial<OwnerOnboardingDraft>) => {
      setDraft((current) => {
        const next = { ...(current ?? EMPTY_DRAFT), ...patch };
        if (userId) void saveDraft(userId, next);
        return next;
      });
    },
    [userId],
  );

  if (session.status === "loading") return <LoadingView />;
  if (session.status !== "signedIn" || session.profile.role !== "owner") return <Redirect href="/" />;
  if (!draft) return <LoadingView />;

  const ids = stepIds(draft.species);
  const index = stepIndex(ids, draft.step);
  const step = ids[index];
  const petName = draft.name.trim();
  const species = draft.species;

  const goTo = (id: string) => update({ step: id });
  const next = () => {
    if (fromSummary) {
      setFromSummary(false);
      goTo("summary");
    } else {
      goTo(ids[Math.min(ids.length - 1, index + 1)]);
    }
  };
  const back = () => {
    setError(null);
    if (fromSummary) {
      setFromSummary(false);
      goTo("summary");
    } else if (index > 0) goTo(ids[index - 1]);
  };
  const pick = (patch: Partial<OwnerOnboardingDraft>, then: () => void = next) => {
    update(patch);
    if (pickTimer.current) clearTimeout(pickTimer.current);
    pickTimer.current = setTimeout(then, PICK_DELAY_MS);
  };
  const edit = (id: string) => {
    setFromSummary(true);
    goTo(id);
  };

  const finish = async (petId: string | null) => {
    if (!userId) return;
    setSaving(true);
    setError(null);
    try {
      if (petId) await saveOwnerOnboarding(userId, draft, petId);
      else await markOwnerOnboarded(userId);
      await clearDraft(userId);
      if (petId) toast.show(`${petName} is added`);
      router.replace("/owner");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const skipLink = (
    <TextButton label="Skip" onPress={next} testID="own-skip" />
  );
  const nextButton = (disabled = false) => <Button label="Next" onPress={next} disabled={disabled} testID="own-next" />;
  /** "You said: “…”" under a field the voice filled in or an option it suggested. */
  const heard = (fact: { quote: string } | null | undefined, show: boolean, id: string, lead = "You said") =>
    fact && show ? (
      <Text style={styles.heard} testID={`own-heard-${id}`}>
        {`✨ ${lead}: “${fact.quote}”`}
      </Text>
    ) : null;
  const frame = (title: string, body: React.ReactNode, footer?: React.ReactNode, hint?: string) => (
    <StepFrame
      progress={progress(ids, step)}
      title={title}
      hint={hint}
      onBack={index > 0 || fromSummary ? back : undefined}
      footer={footer}
      testID={`own-step-${step}`}
    >
      {body}
    </StepFrame>
  );

  if (step === "species") {
    // The step list is built from the species, so the move to the name screen is explicit (`next` still sees the old list).
    const choose = (value: Species) =>
      pick(value === draft.species ? {} : { species: value, answers: {}, safety: {}, voice: NO_FACTS, suggested: [], photoGuess: null, coat: "" }, () => goTo("name"));
    return (
      <StepFrame
        progress={0}
        title="What kind of pet do you have?"
        footer={
          <TextButton
            label={saving ? "Saving…" : "Add a pet later"}
            onPress={() => void finish(null)}
            disabled={saving}
            testID="own-later"
          />
        }
        testID="own-step-species"
      >
        <BigOption label="Dog" selected={species === "dog"} onPress={() => choose("dog")} testID="own-species-dog" />
        <BigOption label="Cat" selected={species === "cat"} onPress={() => choose("cat")} testID="own-species-cat" />
        {error ? <Banner tone="error" body={error} /> : null}
      </StepFrame>
    );
  }

  if (step === "name") {
    return frame(
      "What's your pet's name?",
      <BigInput
        value={draft.name}
        onChangeText={(name) => update({ name: name.slice(0, MAX_NAME) })}
        onSubmitEditing={() => petName && next()}
        returnKeyType="next"
        autoFocus
        accessibilityLabel="Pet name"
        testID="own-name"
      />,
      nextButton(petName === ""),
    );
  }

  // The cover photo is looked at in the background; the answer shows up on the breed and color screens when it comes.
  const changePhotos = (photos: string[]) => {
    update({ photos, ...(photos.length === 0 ? { photoGuess: null } : {}) });
    const cover = photos[0];
    if (!cover || !species || guessed.current.has(cover)) return;
    guessed.current.add(cover);
    void guessFromPhoto(cover, species).then((g) => {
      if (g) update({ photoGuess: { for: cover, breeds: g.breeds, coat: g.coat } });
    });
  };
  const guess = draft.photoGuess && draft.photoGuess.for === draft.photos[0] ? draft.photoGuess : null;

  if (step === "photos") {
    return frame(
      `Add photos of ${petName}`,
      <PetPhotosStep photos={draft.photos} onChange={changePhotos} onBusy={setPhotoBusy} />,
      <>
        <Button label={photoBusy ? "Uploading…" : "Next"} onPress={next} disabled={photoBusy || draft.photos.length === 0} testID="own-next" />
        {skipLink}
      </>,
      "The first one is the cover.",
    );
  }

  if (step === "voice") {
    const read = async (text: string) => {
      if (!species) return;
      setVoiceBusy(true);
      setVoiceError(null);
      try {
        const facts = await extractFacts(species, petName, text, openQuestions(species, petName, draft.answers, draft.safety));
        update(applyVoiceFacts(draft, facts));
        next();
      } catch (e) {
        setVoiceError((e as Error).message);
      } finally {
        setVoiceBusy(false);
      }
    };
    return frame(
      `Tell us about ${petName}`,
      <VoiceStep placeholder={`What is ${petName} like?`} onUse={read} error={voiceError} busy={voiceBusy} />,
      skipLink,
      `What is ${petName} like? Brag a little!`,
    );
  }

  if (step === "breed") {
    return frame(
      `What breed is ${petName}?`,
      <>
        {guess && guess.breeds.length > 0 ? (
          <View style={styles.grid} testID="own-breed-guesses">
            {guess.breeds.map((name, i) => (
              <BigOption
                key={name}
                label={`${name}?`}
                badge="✨ suggested"
                selected={draft.breed === name}
                onPress={() => pick({ breed: name })}
                style={styles.half}
                testID={`own-breed-guess-${i + 1}`}
              />
            ))}
            <BigOption label="Not sure" onPress={() => pick({ breed: "" })} style={styles.half} testID="own-breed-unsure" />
          </View>
        ) : null}
        <BigInput
          value={draft.breed}
          onChangeText={(breed) => update({ breed })}
          onSubmitEditing={next}
          returnKeyType="next"
          accessibilityLabel="Breed"
          testID="own-breed"
        />
        {heard(draft.voice.breed, draft.breed.trim() === draft.voice.breed?.value, "breed")}
      </>,
      <>
        {nextButton(draft.breed.trim() === "")}
        {skipLink}
      </>,
      "A mix is fine. Write what you think.",
    );
  }

  if (step === "coat") {
    return frame(
      `What color is ${petName}?`,
      <View style={styles.grid}>
        {COATS.map((coat) => (
          <BigOption
            key={coat.value}
            label={coat.label}
            selected={draft.coat === coat.value}
            badge={guess?.coat === coat.value && draft.coat === "" ? "✨ suggested" : undefined}
            onPress={() => pick({ coat: coat.value })}
            style={styles.half}
            testID={`own-coat-${coat.value}`}
          />
        ))}
      </View>,
      skipLink,
      "The main color of the coat.",
    );
  }

  if (step === "age") {
    const years = draft.ageYears ?? 3;
    return frame(
      `How old is ${petName}?`,
      <View style={styles.center}>
        <Stepper
          label="Age"
          value={`${years} ${years === 1 ? "year" : "years"}`}
          onDecrease={() => update({ ageYears: Math.max(0, years - 1) })}
          onIncrease={() => update({ ageYears: Math.min(30, years + 1) })}
          canDecrease={years > 0}
          canIncrease={years < 30}
          actions={["younger", "older"]}
          testID="own-age"
        />
        {heard(draft.voice.age_years, draft.ageYears === draft.voice.age_years?.value, "age")}
      </View>,
      <>
        <Button
          label="Next"
          onPress={() => {
            if (draft.ageYears === null) update({ ageYears: years });
            next();
          }}
          testID="own-next"
        />
        {skipLink}
      </>,
    );
  }

  if (step === "weight") {
    return frame(
      `How much does ${petName} weigh?`,
      <>
        <BigInput
          value={draft.weightKg}
          onChangeText={(weightKg) => update({ weightKg })}
          onSubmitEditing={next}
          keyboardType="decimal-pad"
          placeholder="kg"
          accessibilityLabel="Weight in kg"
          testID="own-weight"
        />
        {heard(draft.voice.weight_kg, draft.weightKg.trim() === String(draft.voice.weight_kg?.value), "weight")}
      </>,
      <>
        {nextButton(draft.weightKg.trim() === "")}
        {skipLink}
      </>,
      "In kg.",
    );
  }

  if (step === "petIntro") {
    return frame(
      `Tell us about ${petName}`,
      <BigInput
        value={draft.petIntro}
        onChangeText={(petIntro) => update({ petIntro: petIntro.slice(0, MAX_PET_INTRO) })}
        multiline
        accessibilityLabel={`About ${petName}`}
        testID="own-pet-intro"
      />,
      <>
        {nextButton(draft.petIntro.trim() === "")}
        {skipLink}
      </>,
    );
  }

  if (step.startsWith("q:") && species) {
    const question = chartQuestions(species).find((q) => `q:${q.key}` === step);
    if (!question) return <Redirect href="/owner" />;
    const suggested = draft.suggested.includes(question.key);
    const answered = draft.answers[question.key] !== undefined;
    return frame(
      fill(question.prompt, petName),
      <>
        {suggested ? heard(draft.voice.answers[question.key], true, "q") : null}
        {question.options.map((label, i) => (
          <BigOption
            key={label}
            label={label}
            selected={draft.answers[question.key] === i + 1}
            badge={suggested && draft.answers[question.key] === i + 1 ? "✨ suggested" : undefined}
            onPress={() =>
              pick({
                answers: { ...draft.answers, [question.key]: (i + 1) as Score },
                suggested: draft.suggested.filter((k) => k !== question.key),
              })
            }
            testID={`own-opt-${i + 1}`}
          />
        ))}
      </>,
      <>
        {answered ? nextButton() : null}
        {skipLink}
      </>,
    );
  }

  if (step.startsWith("s:")) {
    const question = SAFETY_QUESTIONS.find((q) => `s:${q.key}` === step);
    if (!question) return <Redirect href="/owner" />;
    // What the owner said is shown, never chosen for them: the tap is the answer.
    const said = draft.voice.answers[question.key];
    return frame(
      fill(question.prompt, petName),
      <>
        {said ? heard(said, true, "safety", "We heard") : null}
        {question.options.map((option) => (
          <BigOption
            key={option.value}
            label={option.label}
            selected={draft.safety[question.key] === option.value}
            badge={said && said.value === option.value && !draft.safety[question.key] ? "✨ suggested" : undefined}
            onPress={() => pick({ safety: { ...draft.safety, [question.key]: option.value } })}
            testID={`own-safe-${option.value}`}
          />
        ))}
      </>,
      skipLink,
    );
  }

  if (step === "foods") {
    const foods = foodsFromDraft(draft);
    const toggle = (food: string) => {
      const key = normalizeAllergen(food);
      const on = foods.includes(key);
      const nextFoods = on ? foods.filter((f) => f !== key) : [...foods, key];
      update({ foods: nextFoods, safety: { ...draft.safety, s6: nextFoods.length > 0 ? "listed" : "" } });
    };
    const addOther = () => {
      const key = normalizeAllergen(otherFood);
      if (key && !foods.includes(key)) update({ foods: [...foods, key], safety: { ...draft.safety, s6: "listed" } });
      setOtherFood("");
      setShowOtherFood(false);
    };
    const typed = foods.filter((f) => !FOOD_CHIPS.some((c) => normalizeAllergen(c) === f));
    // Foods the owner mentioned: offered as chips to tap, never added for them.
    const heardFoods = draft.voice.foods.filter((f) => !foods.includes(normalizeAllergen(f.value)));
    return frame(
      `Foods ${petName} must avoid?`,
      <>
        <View style={styles.grid}>
          {FOOD_CHIPS.map((food) => (
            <BigOption
              key={food}
              label={food}
              badge={heardFoods.some((f) => normalizeAllergen(f.value) === normalizeAllergen(food)) ? "✨ suggested" : undefined}
              selected={foods.includes(normalizeAllergen(food))}
              onPress={() => toggle(food)}
              style={styles.half}
              testID={`own-food-${normalizeAllergen(food)}`}
            />
          ))}
          {typed.map((food) => (
            <BigOption key={food} label={food} selected onPress={() => toggle(food)} style={styles.half} testID={`own-food-${food}`} />
          ))}
          {heardFoods
            .filter((f) => !FOOD_CHIPS.some((c) => normalizeAllergen(c) === normalizeAllergen(f.value)))
            .map((f) => (
              <BigOption
                key={f.value}
                label={f.value}
                badge="✨ suggested"
                onPress={() => toggle(f.value)}
                style={styles.half}
                testID={`own-food-${normalizeAllergen(f.value)}`}
              />
            ))}
          <BigOption
            label="None"
            selected={foods.length === 0 && draft.safety.s6 === "none"}
            onPress={() => update({ foods: [], safety: { ...draft.safety, s6: "none" } })}
            style={styles.half}
            testID="own-food-none"
          />
          <BigOption label="Something else" onPress={() => setShowOtherFood(true)} style={styles.half} testID="own-food-else" />
        </View>
        {heardFoods.length > 0 ? heard(heardFoods[0], true, "foods", "We heard") : null}
        {showOtherFood ? (
          <View style={styles.row}>
            <View style={styles.rowInput}>
              <BigInput
                value={otherFood}
                onChangeText={setOtherFood}
                onSubmitEditing={addOther}
                autoFocus
                accessibilityLabel="Another food"
                testID="own-food-other-input"
              />
            </View>
            <Button label="Add" onPress={addOther} disabled={otherFood.trim() === ""} testID="own-food-other-add" />
          </View>
        ) : null}
      </>,
      <>
        {nextButton(foods.length === 0 && draft.safety.s6 !== "none")}
        {skipLink}
      </>,
    );
  }

  if (step === "ownerIntro") {
    return frame(
      "A few words about you",
      <BigInput
        value={draft.intro}
        onChangeText={(intro) => update({ intro: intro.slice(0, MAX_OWNER_INTRO) })}
        multiline
        accessibilityLabel="About you"
        testID="own-intro"
      />,
      <>
        {nextButton(draft.intro.trim() === "")}
        {skipLink}
      </>,
      "Your sitter reads this.",
    );
  }

  if (step === "location") {
    const useCurrentLocation = async () => {
      setLocating(true);
      setLocationNote(null);
      try {
        update({ home: await getCurrentPosition(), homeAddress: "" });
      } catch (e) {
        setLocationNote(
          e instanceof LocationError && e.reason === "denied"
            ? "Location is off for Goldito in this browser. Type your address instead."
            : "We couldn't read your location. Type your address instead.",
        );
      } finally {
        setLocating(false);
      }
    };
    return frame(
      "Where do you live?",
      <>
        <AddressInput
          label="Home address"
          value={draft.homeAddress}
          onChangeText={(homeAddress) => update({ homeAddress, home: homeAddress.trim() === draft.homeAddress.trim() ? draft.home : null })}
          placed={draft.home && draft.homeAddress ? draft.homeAddress : null}
          onPick={(s) => update({ homeAddress: s.label, home: s.point })}
          testID="own-address"
        />
        <TextButton
          label={locating ? "Locating…" : draft.home && !draft.homeAddress ? "Read my location again" : "Use my current location"}
          onPress={() => void useCurrentLocation()}
          disabled={locating}
          testID="own-use-location"
        />
        {draft.home && !draft.homeAddress ? (
          <Text style={styles.note} testID="own-pin-ok">
            Pin set
          </Text>
        ) : null}
        {locationNote ? <Text style={styles.note}>{locationNote}</Text> : null}
      </>,
      <>
        {nextButton(!draft.home)}
        {skipLink}
      </>,
      "Sitters only see a rough distance.",
    );
  }

  // Summary: what will be saved. Tap a row to change it.
  const foods = foodsFromDraft(draft);
  const profile = profileFromDraft(draft);
  const chartTotal = species ? chartQuestions(species).length : 0;
  const answered = Object.keys(profile.answers).length;
  const safeAnswered = SAFETY_QUESTIONS.filter((q) => profile.safety[q.key]).length;
  const rows: { id: string; label: string; value: string }[] = [
    { id: "name", label: "Name", value: petName },
    { id: "photos", label: "Photos", value: draft.photos.length ? String(draft.photos.length) : "Not shared yet" },
    { id: "breed", label: "Breed", value: draft.breed.trim() || "Not shared yet" },
    { id: "coat", label: "Color", value: COATS.find((c) => c.value === draft.coat)?.label ?? "Not shared yet" },
    {
      id: "age",
      label: "Age",
      value: draft.ageYears === null ? "Not shared yet" : `${draft.ageYears} ${draft.ageYears === 1 ? "year" : "years"}`,
    },
    { id: "weight", label: "Weight", value: draft.weightKg.trim() ? `${draft.weightKg.trim()} kg` : "Not shared yet" },
    { id: "petIntro", label: "About", value: draft.petIntro.trim() || "Not shared yet" },
    { id: species ? `q:${chartQuestions(species)[0].key}` : "name", label: "Personality", value: `${answered} of ${chartTotal} answered` },
    { id: `s:${SAFETY_QUESTIONS[0].key}`, label: "Safety", value: `${safeAnswered} of ${SAFETY_QUESTIONS.length} answered` },
    { id: "foods", label: "Foods to avoid", value: foods.length ? foods.join(", ") : draft.safety.s6 === "none" ? "None" : "Not shared yet" },
    { id: "ownerIntro", label: "About you", value: draft.intro.trim() || "Not shared yet" },
    { id: "location", label: "Home", value: draft.home ? draft.homeAddress.trim() || "Pin set" : "Not shared yet" },
  ];
  return (
    <StepFrame
      progress={1}
      title={`Meet ${petName}`}
      onBack={back}
      footer={
        <>
          {error ? <Banner tone="error" body={error} testID="own-error" /> : null}
          <Button label={saving ? "Saving…" : `Save ${petName}`} onPress={() => void finish(draft.petId ?? ensurePetId())} disabled={saving} testID="own-save" />
        </>
      }
      testID="own-step-summary"
    >
      {species ? (
        <PetGlanceCard
          name={petName}
          species={species}
          facts={glanceFacts(species, draft.breed.trim() || null, draft.ageYears === null ? null : birthdateFromAge(draft.ageYears), weightFromDraft(draft))}
          coverPublicId={draft.photos[0] ?? null}
          profile={profile}
          allergens={foods}
          needs={needs}
          testID="own-glance"
        />
      ) : null}
      {rows.map((row) => (
        <Pressable
          key={row.label}
          accessibilityRole="button"
          accessibilityLabel={`Change ${row.label}`}
          onPress={() => edit(row.id)}
          style={styles.summaryRow}
          testID={`own-row-${row.label.toLowerCase().replace(/\s+/g, "-")}`}
        >
          <View style={styles.summaryText}>
            <Text style={styles.summaryLabel}>{row.label}</Text>
            <Text style={styles.summaryValue}>{row.value}</Text>
          </View>
          <Ionicons name="chevron-forward" size={theme.icon.sm} color={theme.color.textMuted} />
        </Pressable>
      ))}
    </StepFrame>
  );

  function ensurePetId(): string {
    const id = newPetId();
    update({ petId: id });
    return id;
  }
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    center: { alignItems: "center", paddingVertical: theme.spacing.lg },
    grid: { flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.sm },
    half: { flexBasis: "47%", flexGrow: 1 },
    row: { flexDirection: "row", gap: theme.spacing.sm, alignItems: "center" },
    rowInput: { flex: 1 },
    summaryRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.sm,
      minHeight: 64,
      paddingHorizontal: theme.spacing.md,
      paddingVertical: theme.spacing.sm,
      backgroundColor: theme.color.surface,
      borderRadius: theme.ui.radius.button,
      borderWidth: 1,
      borderColor: theme.color.border,
    },
    summaryText: { flex: 1, gap: 2 },
    summaryLabel: { fontSize: 18, color: theme.color.textMuted },
    summaryValue: { fontSize: 20, lineHeight: 26, fontWeight: theme.fontWeight.semibold, color: theme.color.text },
    note: { fontSize: 18, lineHeight: 24, color: theme.color.textMuted },
    heard: { fontSize: 18, lineHeight: 24, color: theme.color.primary },
  });
