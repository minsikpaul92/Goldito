import { expect, test } from "@playwright/test";

import { birthdateFromAge, foodsFromDraft, EMPTY_DRAFT, weightFromDraft } from "../features/ownerOnboarding/draft";
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

  test("age, weight and foods are cleaned up for saving", () => {
    expect(birthdateFromAge(4, new Date(2026, 9, 21))).toBe("2022-10-21");
    expect(weightFromDraft({ ...EMPTY_DRAFT, weightKg: "6,5" })).toBe(6.5);
    expect(weightFromDraft({ ...EMPTY_DRAFT, weightKg: "" })).toBeNull();
    expect(weightFromDraft({ ...EMPTY_DRAFT, weightKg: "abc" })).toBeNull();
    expect(foodsFromDraft({ ...EMPTY_DRAFT, foods: [" Chicken ", "chicken", "Dairy", ""] })).toEqual(["chicken", "dairy"]);
  });
});
