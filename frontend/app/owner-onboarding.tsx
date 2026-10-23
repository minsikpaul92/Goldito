import { Redirect, router } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Icon } from "../components/ui/Icon";
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
import { LinkButton } from "../components/ui/LinkButton";
import { SegmentedControl } from "../components/ui/SegmentedControl";
import { Stepper } from "../components/ui/Stepper";
import { TextButton } from "../components/ui/TextButton";
import {
  EMPTY_DRAFT,
  OwnerOnboardingDraft,
  birthdateFromAge,
  clearDraft,
  convertWeight,
  draftForNextPet,
  foodsFromDraft,
  loadDraft,
  MAX_PETS_PER_KIND,
  petCounts,
  profileFromDraft,
  saveDraft,
  weightFromDraft,
  withPetCounts,
} from "../features/ownerOnboarding/draft";
import { applyVoiceFacts } from "../features/ownerOnboarding/applyVoice";
import { useBreedNeeds } from "../features/ownerOnboarding/breedNeedsApi";
import { guessFromPhoto } from "../features/ownerOnboarding/photoGuessApi";
import { extractFacts, openQuestions } from "../features/ownerOnboarding/voiceApi";
import { markOwnerOnboarded, newPetId, saveOwnerOnboarding } from "../features/ownerOnboarding/ownerOnboardingApi";
import {
  COATS,
  FOOD_CHIPS,
  QUESTION_SOURCES,
  SAFETY_QUESTIONS,
  Score,
  chartQuestions,
  fill,
} from "../features/ownerOnboarding/questions";
import { glanceFacts } from "../features/ownerOnboarding/petGlanceApi";
import { progress, stepIds, stepIndex } from "../features/ownerOnboarding/steps";
import { normalizeAllergen } from "../features/pets/petValidation";
import { LocationError, getCurrentPosition } from "../lib/location";
import { reverseGeocode } from "../lib/transit";
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

  const ids = stepIds(draft.species, draft.ownerDone);
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

  const finish = async (petId: string | null, finishLater = false) => {
    if (!userId) return;
    setSaving(true);
    setError(null);
    try {
      // "Finish later" ends here: the pets still to come are not asked about now.
      const last = draft.pending.length === 0 || finishLater;
      if (petId) await saveOwnerOnboarding(userId, draft, petId, last);
      else await markOwnerOnboarded(userId);
      if (petId) toast.show(`${petName} is added`);
      if (petId && !last) {
        // The next pet starts from its first question; the owner is not done until the last one is saved.
        const nextDraft = draftForNextPet(draft);
        await saveDraft(userId, nextDraft);
        setFromSummary(false);
        setDraft(nextDraft);
        return;
      }
      await clearDraft(userId);
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

  const canSkipAll =
    step === "about" ||
    step.startsWith("q:") ||
    step.startsWith("s:") ||
    step === "foods" ||
    step === "ownerIntro" ||
    step === "location";

  const skipAll = () => {
    setFromSummary(false);
    goTo("summary");
  };

  const frame = (title: string, body: React.ReactNode, footer?: React.ReactNode, hint?: string) => (
    <StepFrame
      progress={progress(ids, step)}
      title={title}
      hint={hint}
      onBack={index > 0 || fromSummary ? back : undefined}
      onSkipAll={canSkipAll ? skipAll : undefined}
      footer={footer}
      testID={`own-step-${step}`}
    >
      {body}
    </StepFrame>
  );

  if (step === "species") {
    // Each kind has a count: the questions then run once per pet, dogs first.
    const counts = petCounts(draft);
    const setCount = (kind: Species, n: number) => update(withPetCounts(draft, { ...counts, [kind]: n }));
    const total = counts.dog + counts.cat;
    const kindRow = (kind: Species, label: string, plural: string) => (
      <>
        <BigOption
          label={label}
          selected={counts[kind] > 0}
          onPress={() => setCount(kind, counts[kind] > 0 ? 0 : 1)}
          testID={`own-species-${kind}`}
        />
        {counts[kind] > 0 ? (
          <View style={styles.countRow}>
            <Text style={styles.countLabel}>{`How many ${plural}?`}</Text>
            <Stepper
              label={plural}
              value={String(counts[kind])}
              onDecrease={() => setCount(kind, counts[kind] - 1)}
              onIncrease={() => setCount(kind, counts[kind] + 1)}
              canDecrease={counts[kind] > 1}
              canIncrease={counts[kind] < MAX_PETS_PER_KIND}
              actions={["fewer", "more"]}
              testID={`own-count-${kind}`}
            />
          </View>
        ) : null}
      </>
    );
    return (
      <StepFrame
        progress={0}
        title="What kind of pet do you have?"
        footer={
          <>
            <Button label="Next" onPress={() => goTo("name")} disabled={total === 0} testID="own-next" />
            <TextButton
              label={saving ? "Saving…" : "Add a pet later"}
              onPress={() => void finish(null)}
              disabled={saving}
              testID="own-later"
            />
          </>
        }
        testID="own-step-species"
      >
        {kindRow("dog", "Dog", "dogs")}
        {kindRow("cat", "Cat", "cats")}
        {error ? <Banner tone="error" body={error} /> : null}
      </StepFrame>
    );
  }

  if (step === "name") {
    // With a dog and a cat the question says which one it is about.
    const several = draft.ownerDone || draft.pending.length > 0;
    return frame(
      several && species ? `What's your ${species}'s name?` : "What's your pet's name?",
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
    const kg = weightFromDraft(draft);
    const heardKg = draft.voice.weight_kg;
    return frame(
      `How much does ${petName} weigh?`,
      <>
        <SegmentedControl
          options={[
            { value: "kg", label: "kg" },
            { value: "lbs", label: "lbs" },
          ]}
          value={draft.weightUnit}
          onChange={(weightUnit) => update({ weightUnit, weight: convertWeight(draft.weight, draft.weightUnit, weightUnit) })}
          testID="own-weight-unit"
        />
        <BigInput
          value={draft.weight}
          onChangeText={(weight) => update({ weight })}
          onSubmitEditing={next}
          keyboardType="decimal-pad"
          placeholder={draft.weightUnit}
          accessibilityLabel={`Weight in ${draft.weightUnit}`}
          testID="own-weight"
        />
        {heard(heardKg, kg !== null && heardKg !== null && Math.abs(kg - heardKg.value) < 0.06, "weight")}
      </>,
      <>
        {nextButton(draft.weight.trim() === "")}
        {skipLink}
      </>,
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

  if (step === "about" && species) {
    return frame(
      "Where these questions come from",
      <>
        <Text style={styles.note}>We wrote them ourselves, in plain words. The ideas come from published pet personality surveys. It is not a behavior test.</Text>
        <View style={styles.sources} testID="own-sources">
          <Text style={styles.noteStrong}>Sources</Text>
          {QUESTION_SOURCES[species].map((source, i) => (
            <LinkButton key={source.url} label={source.label} href={source.url} look="text" testID={`own-source-${i + 1}`} />
          ))}
        </View>
      </>,
      <>
        <Button label="Start" onPress={next} testID="own-next" />
        <TextButton label="Skip questions" onPress={skipAll} testID="own-skip-questions" />
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
        const point = await getCurrentPosition();
        update({ home: point, homeAddress: "" });
        // The address found fills the field so the person can see it was read right; the pin stays either way.
        const place = await reverseGeocode(point);
        if (place?.address) update({ homeAddress: place.address });
        else setLocationNote("No address found here. The pin is kept.");
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
        <Button
          label={locating ? "Locating…" : draft.home && !draft.homeAddress ? "📍 Read my location again" : "📍 Use my current location"}
          variant="secondary"
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
    { id: "weight", label: "Weight", value: draft.weight.trim() ? `${draft.weight.trim()} ${draft.weightUnit}` : "Not shared yet" },
    { id: "petIntro", label: "About", value: draft.petIntro.trim() || "Not shared yet" },
    { id: species ? `q:${chartQuestions(species)[0].key}` : "name", label: "Personality", value: `${answered} of ${chartTotal} answered` },
    { id: `s:${SAFETY_QUESTIONS[0].key}`, label: "Safety", value: `${safeAnswered} of ${SAFETY_QUESTIONS.length} answered` },
    { id: "foods", label: "Foods to avoid", value: foods.length ? foods.join(", ") : draft.safety.s6 === "none" ? "None" : "Not shared yet" },
    // The owner's own answers are asked with the first pet only.
    ...(draft.ownerDone
      ? []
      : [
          { id: "ownerIntro", label: "About you", value: draft.intro.trim() || "Not shared yet" },
          { id: "location", label: "Home", value: draft.home ? draft.homeAddress.trim() || "Pin set" : "Not shared yet" },
        ]),
  ];
  return (
    <StepFrame
      progress={1}
      title={`Meet ${petName}`}
      onBack={back}
      footer={
        <>
          {error ? <Banner tone="error" body={error} testID="own-error" /> : null}
          <Button
            label={saving ? "Saving…" : draft.pending.length > 0 ? `Save ${petName} and add the next pet` : `Save ${petName}`}
            onPress={() => void finish(draft.petId ?? ensurePetId())}
            disabled={saving}
            testID="own-save"
          />
          {draft.pending.length > 0 ? (
            <Button
              label="Save and finish later"
              variant="secondary"
              onPress={() => void finish(draft.petId ?? ensurePetId(), true)}
              disabled={saving}
              testID="own-save-later"
            />
          ) : null}
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
          <Icon name="forward" size={theme.icon.sm} color={theme.color.textMuted} />
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
    countRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: theme.spacing.xs },
    countLabel: { fontSize: 18, lineHeight: 24, color: theme.color.text },
    summaryRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.sm,
      minHeight: 64,
      paddingHorizontal: theme.spacing.md,
      paddingVertical: theme.spacing.sm,
      backgroundColor: theme.color.surface,
      // A box, not a pill: a long answer (About) would turn a pill into an oval.
      borderRadius: theme.ui.radius.card,
      borderWidth: 1,
      borderColor: theme.color.border,
    },
    summaryText: { flex: 1, gap: 2 },
    summaryLabel: { fontSize: 18, color: theme.color.textMuted },
    summaryValue: { fontSize: 20, lineHeight: 26, fontWeight: theme.fontWeight.semibold, color: theme.color.text },
    note: { fontSize: 18, lineHeight: 24, color: theme.color.textMuted },
    noteStrong: { fontSize: 18, lineHeight: 24, fontWeight: theme.fontWeight.bold, color: theme.color.text },
    sources: { gap: 0, alignItems: "flex-start" },
    heard: { fontSize: 18, lineHeight: 24, color: theme.color.primary },
  });
