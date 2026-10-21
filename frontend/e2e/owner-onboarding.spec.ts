import { expect, test } from "@playwright/test";

import { app, signIn } from "./helpers";
import { OWNER, mockSupabase } from "./supabaseMock";

// Owner sign-up questions (11.15 S1, #185): one question per screen, large text, every question skippable.

async function newOwner(page: import("@playwright/test").Page) {
  const { db } = await mockSupabase(page, [OWNER]);
  db.owner_profiles.push({ id: OWNER.id, home_address: null, home_lat: null, home_lng: null, onboarded_at: null });
  return db;
}

test.describe("owner onboarding", () => {
  test("a new owner answers, checks the summary and saves their first pet", async ({ page }) => {
    const db = await newOwner(page);
    await signIn(page, OWNER);
    await expect(page).toHaveURL(/\/owner-onboarding$/);
    const screen = app(page);

    await expect(screen.getByTestId("own-title")).toHaveText("What kind of pet do you have?");
    await screen.getByTestId("own-species-dog").click();
    await expect(screen.getByTestId("own-step-name")).toBeVisible();
    await expect(screen.getByTestId("own-title")).toHaveText("What's your pet's name?");
    await expect(screen.getByTestId("own-next")).toBeDisabled();
    await screen.getByTestId("own-name").fill("Pip");
    await screen.getByTestId("own-next").click();

    await expect(screen.getByTestId("own-title")).toHaveText("What breed is Pip?");
    await screen.getByTestId("own-breed").fill("Maltese");
    await screen.getByTestId("own-next").click();
    await expect(screen.getByTestId("own-title")).toHaveText("How old is Pip?");
    await screen.getByTestId("own-age-plus").click();
    await screen.getByTestId("own-next").click();
    await screen.getByTestId("own-weight").fill("6,5");
    await screen.getByTestId("own-next").click();
    await expect(screen.getByTestId("own-title")).toHaveText("Tell us about Pip");
    await screen.getByTestId("own-pet-intro").fill("Loves the sofa.");
    await screen.getByTestId("own-next").click();

    // The 12 chart questions: the name is in every question, a tap goes on by itself.
    await expect(screen.getByTestId("own-title")).toHaveText("When a visitor comes in, Pip…");
    for (let i = 1; i <= 12; i++) {
      await expect(screen.getByTestId(`own-step-q:d${i}`)).toBeVisible();
      await screen.getByTestId(i <= 6 ? "own-opt-4" : "own-opt-2").click();
    }

    // Safety: bites once, not sure about others, the rest skipped.
    await expect(screen.getByTestId("own-title")).toHaveText("Has Pip ever bitten or snapped at a person?");
    await screen.getByTestId("own-safe-once").click();
    await expect(screen.getByTestId("own-step-s:s2")).toBeVisible();
    await screen.getByTestId("own-safe-unsure").click();
    for (const key of ["s3", "s4", "s5"]) {
      await expect(screen.getByTestId(`own-step-s:${key}`)).toBeVisible();
      await screen.getByTestId("own-skip").click();
    }
    await expect(screen.getByTestId("own-step-foods")).toBeVisible();
    await screen.getByTestId("own-food-chicken").click();
    await screen.getByTestId("own-food-else").click();
    await screen.getByTestId("own-food-other-input").fill("Grapes");
    await screen.getByTestId("own-food-other-add").click();
    await screen.getByTestId("own-next").click();

    await expect(screen.getByTestId("own-title")).toHaveText("Meet Pip");
    await expect(screen.getByTestId("own-row-personality")).toContainText("12 of 12 answered");
    await expect(screen.getByTestId("own-row-safety")).toContainText("2 of 5 answered");
    await expect(screen.getByTestId("own-row-foods-to-avoid")).toContainText("chicken, grapes");
    await expect(screen.getByText("Has snapped once")).toBeVisible();
    await expect(screen.getByText("Owner isn't sure (other animals)")).toBeVisible();

    // A row opens its screen; after one answer it comes back to the summary.
    await screen.getByTestId("own-row-name").click();
    await screen.getByTestId("own-name").fill("Pippa");
    await screen.getByTestId("own-next").click();
    await expect(screen.getByTestId("own-title")).toHaveText("Meet Pippa");

    await screen.getByTestId("own-save").click();
    await expect(page).toHaveURL(/\/owner$/);

    const pet = db.pets.find((p) => p.owner_id === OWNER.id)!;
    expect(pet).toMatchObject({ species: "dog", name: "Pippa", breed: "Maltese", weight_kg: 6.5, notes: "Loves the sofa." });
    expect(String(pet.birthdate)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(pet.profile).toMatchObject({ v: 1, safety: { s1: "once", s2: "unsure", s6: "listed" } });
    expect((pet.profile as { answers: Record<string, number> }).answers).toMatchObject({ d1: 4, d6: 4, d7: 2, d12: 2 });
    expect(db.pet_allergies.map((a) => a.allergen).sort()).toEqual(["chicken", "grapes"]);
    expect(db.owner_profiles.find((p) => p.id === OWNER.id)?.onboarded_at).not.toBeNull();
  });

  test("every question can be skipped, and a skipped answer is not a Not sure", async ({ page }) => {
    const db = await newOwner(page);
    await signIn(page, OWNER);
    const screen = app(page);
    await screen.getByTestId("own-species-cat").click();
    await screen.getByTestId("own-name").fill("Mochi");
    await screen.getByTestId("own-next").click();
    for (const id of ["breed", "age", "weight", "petIntro"]) {
      await expect(screen.getByTestId(`own-step-${id}`)).toBeVisible();
      await screen.getByTestId("own-skip").click();
    }
    // Cat list: 10 chart questions, no dog-only wording.
    for (let i = 1; i <= 10; i++) {
      await expect(screen.getByTestId(`own-step-q:c${i}`)).toBeVisible();
      await screen.getByTestId("own-skip").click();
    }
    for (const key of ["s1", "s2", "s3", "s4", "s5"]) {
      await expect(screen.getByTestId(`own-step-s:${key}`)).toBeVisible();
      await screen.getByTestId("own-skip").click();
    }
    await screen.getByTestId("own-skip").click();
    await expect(screen.getByTestId("own-row-personality")).toContainText("0 of 10 answered");
    await expect(screen.getByTestId("own-row-breed")).toContainText("Not shared yet");
    await expect(screen.getByText("Owner isn't sure")).toHaveCount(0);
    await screen.getByTestId("own-save").click();
    await expect(page).toHaveURL(/\/owner$/);
    const pet = db.pets.find((p) => p.owner_id === OWNER.id)!;
    expect(pet).toMatchObject({ species: "cat", name: "Mochi", breed: null, birthdate: null, weight_kg: null, notes: null });
    expect(pet.profile).toEqual({ v: 1, answers: {}, safety: {} });
  });

  test("Back goes to the last screen, and a reload goes on where the owner was", async ({ page }) => {
    await newOwner(page);
    await signIn(page, OWNER);
    const screen = app(page);
    await screen.getByTestId("own-species-dog").click();
    await screen.getByTestId("own-name").fill("Pip");
    await screen.getByTestId("own-next").click();
    await expect(screen.getByTestId("own-step-breed")).toBeVisible();
    await screen.getByTestId("own-back").click();
    await expect(screen.getByTestId("own-name")).toHaveValue("Pip");
    await screen.getByTestId("own-next").click();
    await page.reload();
    await expect(screen.getByTestId("own-step-breed")).toBeVisible();
  });

  test("Add a pet later marks the owner done and goes home without a pet", async ({ page }) => {
    const db = await newOwner(page);
    await signIn(page, OWNER);
    await app(page).getByTestId("own-later").click();
    await expect(page).toHaveURL(/\/owner$/);
    expect(db.pets).toHaveLength(0);
    expect(db.owner_profiles.find((p) => p.id === OWNER.id)?.onboarded_at).not.toBeNull();
  });

  test("an owner who was here before is not sent to the questions", async ({ page }) => {
    await mockSupabase(page, [OWNER]);
    await signIn(page, OWNER);
    await expect(page).toHaveURL(/\/owner$/);
  });
});
