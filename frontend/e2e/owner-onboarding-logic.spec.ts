import { expect, test } from "@playwright/test";

import { applyVoiceFacts, introFromNotes } from "../features/ownerOnboarding/applyVoice";
import { openQuestions } from "../features/ownerOnboarding/voiceApi";
import { birthdateFromAge, convertWeight, foodsFromDraft, EMPTY_DRAFT, weightFromDraft, weightText } from "../features/ownerOnboarding/draft";
import { CAT_QUESTIONS, DOG_QUESTIONS, SAFETY_QUESTIONS, chartAxes, fill } from "../features/ownerOnboarding/questions";
import { axisLevels, glance, missingAxes, parseProfile, safetyChips } from "../features/ownerOnboarding/scoring";

// Owner sign-up questions (11.15, #185): wording shape, levels, warnings. No browser needed.

test.describe("owner onboarding logic", () => {
  test("the dog list is 12 questions over five axes, the cat list 10, all with four options", () => {
    expect(DOG_QUESTIONS).toHaveLength(12);
    expect(CAT_QUESTIONS).toHaveLength(10);
    for (const q of [...DOG_QUESTIONS, ...CAT_QUESTIONS]) expect(new Set(q.options).size).toBe(4);
    expect(new Set(DOG_QUESTIONS.map((q) => q.axis))).toEqual(new Set(chartAxes("dog")));
    expect(new Set(CAT_QUESTIONS.map((q) => q.axis))).toEqual(new Set(chartAxes("cat")));
    expect(SAFETY_QUESTIONS).toHaveLength(5);
  });

  test("question keys are unique", () => {
    const keys = [...DOG_QUESTIONS, ...CAT_QUESTIONS].map((q) => q.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  test("no dog-only words in cat questions, and no score words on screen", () => {
    const text = CAT_QUESTIONS.flatMap((q) => [q.prompt, ...q.options]).join(" ").toLowerCase();
    expect(text).not.toMatch(/walk|leash|sit\b/);
    const all = [...DOG_QUESTIONS, ...CAT_QUESTIONS, ...SAFETY_QUESTIONS].map((q) => q.prompt).join(" ").toLowerCase();
    expect(all).not.toMatch(/mbti|%|verified/);
  });

  test("a prompt carries the pet's name, or a plain word when it is empty", () => {
    expect(fill("When a visitor comes in, {name}…", "Max")).toBe("When a visitor comes in, Max…");
    expect(fill("{name} is fine", "  ")).toBe("your pet is fine");
  });

  test("an axis level is the rounded average of its answers; axes with no answer are left out", () => {
    const levels = axisLevels("dog", { d1: 4, d2: 3, d3: 3, d4: 1 });
    expect(levels.map((l) => [l.axis, l.level, l.word])).toEqual([
      ["sociability", 3, "Friendly"],
      ["sensitivity", 1, "Unfazed"],
    ]);
    expect(missingAxes("dog", { d1: 4 })).toEqual(["sensitivity", "energy", "appetite", "trainability"]);
  });

  test("the cat chart ends in Handling, not Trainability", () => {
    expect(axisLevels("cat", { c10: 4 }).map((l) => [l.axis, l.word])).toEqual([["handling", "Easygoing"]]);
  });

  test("warnings follow the spec; Not sure reads differently from a skipped question", () => {
    const chips = safetyChips({ s1: "once", s2: "picky", s3: "unsure", s4: "people", s5: "both" }, ["chicken"]);
    expect(chips.map((c) => [c.tone, c.text])).toEqual([
      ["warning", "Has snapped once"],
      ["unsure", "Owner isn't sure (slipping out)"],
      ["warning", "Guards from people too"],
      ["info", "Medication and a condition"],
      ["info", "No chicken"],
    ]);
    expect(safetyChips({}, [])).toEqual([]);
  });

  test("a glance with nothing described is empty", () => {
    expect(glance("dog", parseProfile(null), []).empty).toBe(true);
    expect(glance("dog", parseProfile({ answers: { d1: 2 } }), []).empty).toBe(false);
  });

  test("a stored profile is read defensively", () => {
    expect(parseProfile({ answers: { d1: 9, d2: 3, d3: "x" }, safety: { s1: "never", zz: "a", s2: 5 } })).toEqual({
      v: 1,
      answers: { d2: 3 },
      safety: { s1: "never" },
    });
    expect(parseProfile("nope")).toEqual({ v: 1, answers: {}, safety: {} });
  });

  test("a weight in lbs is saved as kg with two decimals, and the unit switch converts what was typed", () => {
    const lbs = { ...EMPTY_DRAFT, weightUnit: "lbs" as const };
    expect(weightFromDraft({ ...lbs, weight: "15" })).toBe(6.8);
    expect(weightFromDraft({ ...lbs, weight: "13,5" })).toBe(6.12);
    expect(weightFromDraft({ ...lbs, weight: "0" })).toBeNull();
    expect(weightFromDraft({ ...lbs, weight: "2300" })).toBeNull(); // over 1000 kg
    expect(weightFromDraft({ ...EMPTY_DRAFT, weight: "1000" })).toBeNull();
    expect(weightText(5.9, "lbs")).toBe("13");
    expect(weightText(6.8, "kg")).toBe("6.8");
    expect(convertWeight("15", "lbs", "kg")).toBe("6.8");
    expect(convertWeight("6.8", "kg", "lbs")).toBe("15");
    expect(convertWeight("", "kg", "lbs")).toBe("");
    expect(convertWeight("abc", "kg", "lbs")).toBe("abc");
    expect(convertWeight("6.8", "kg", "kg")).toBe("6.8");
  });

  test("age, weight and foods are cleaned up for saving", () => {
    expect(birthdateFromAge(4, new Date(2026, 9, 21))).toBe("2022-10-21");
    expect(weightFromDraft({ ...EMPTY_DRAFT, weight: "6,5" })).toBe(6.5);
    expect(weightFromDraft({ ...EMPTY_DRAFT, weight: "" })).toBeNull();
    expect(weightFromDraft({ ...EMPTY_DRAFT, weight: "abc" })).toBeNull();
    expect(foodsFromDraft({ ...EMPTY_DRAFT, foods: [" Chicken ", "chicken", "Dairy", ""] })).toEqual(["chicken", "dairy"]);
  });
});

test.describe("voice facts in the draft", () => {
  const facts = {
    breed: { value: "Maltese", quote: "a Maltese" },
    age_years: { value: 4, quote: "four years old" },
    weight_kg: { value: 5.9, quote: "13 pounds" },
    foods: [{ value: "chicken", quote: "allergic to chicken" }],
    answers: {
      s1: { value: "once", quote: "once snapped" },
    },
    notes: {
      personality: { value: "she is a sweet girl", quote: "she is a sweet girl" },
      eats: { value: "wet food twice a day", quote: "wet food twice a day" },
      careful: { value: "no jumping", quote: "no jumping" },
    },
  };

  test("empty fields are filled, the intro is the owner's own words, safety and foods are never filled", () => {
    const patch = applyVoiceFacts(EMPTY_DRAFT, facts);
    expect(patch).toMatchObject({
      breed: "Maltese",
      ageYears: 4,
      weight: "5.9",
      petIntro: "she is a sweet girl\nEats: wet food twice a day\nCareful with: no jumping",
    });
    expect(patch.answers).toBeUndefined();
    expect(patch.suggested).toBeUndefined();
    expect(patch.safety).toBeUndefined();
    expect(patch.foods).toBeUndefined();
    expect(patch.voice).toBe(facts);
  });

  test("a heard weight is written in the unit the owner picked", () => {
    expect(applyVoiceFacts({ ...EMPTY_DRAFT, weightUnit: "lbs" }, facts).weight).toBe("13");
  });

  test("what the owner already picked is kept", () => {
    const patch = applyVoiceFacts({ ...EMPTY_DRAFT, breed: "Poodle", ageYears: 9, weight: "3", petIntro: "My own words" }, facts);
    expect(patch.breed).toBeUndefined();
    expect(patch.ageYears).toBeUndefined();
    expect(patch.weight).toBeUndefined();
    expect(patch.petIntro).toBeUndefined();
  });

  test("a note is cut to the intro limit and an empty one adds nothing", () => {
    expect(introFromNotes({}, 500)).toBe("");
    expect(introFromNotes({ likes: { value: "x".repeat(600), quote: "x" } }, 500)).toHaveLength(500);
  });

  test("only the safety questions still open go to the server, never the personality chart", () => {
    const questions = openQuestions("Pip", { s1: "never" });
    const keys = questions.map((q) => q.key);
    expect(keys.some((k) => /^[dc]\d+$/.test(k))).toBe(false);
    expect(keys).not.toContain("s1");
    expect(keys).toContain("s2");
    expect(questions.find((q) => q.key === "s2")?.prompt).toContain("Pip");
  });
});
