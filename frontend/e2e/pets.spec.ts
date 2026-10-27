import { expect, test } from "@playwright/test";

import { app, signIn } from "./helpers";
import { OWNER, mockSupabase, type MockDb } from "./supabaseMock";

// Owner pet profiles in the desktop phone frame (phase-03 3.5).

function seedBori(db: MockDb) {
  db.pets.push({
    id: "pet-max",
    owner_id: OWNER.id,
    species: "dog",
    name: "Max",
    breed: "Maltese",
    birthdate: null,
    weight_kg: null,
    notes: null,
    created_at: "2026-10-01T09:00:00Z",
  });
  db.pet_allergies.push({ id: "allergy-chicken", pet_id: "pet-max", allergen: "chicken" });
}

/** Every optional question skipped until the summary; the foods screen gets `foods` (or none). */
async function answerToSummary(page: import("@playwright/test").Page, foods: string[] = []) {
  const screen = app(page);
  const skip = screen.getByTestId("own-skip");
  const summary = screen.getByTestId("own-step-summary");
  const about = screen.getByTestId("own-step-about");
  const foodsStep = screen.getByTestId("own-step-foods");
  for (let i = 0; i < 80; i++) {
    await expect(skip.or(summary).or(about).or(foodsStep)).toBeVisible();
    if (await summary.isVisible()) return;
    if (await about.isVisible()) await screen.getByTestId("own-next").click();
    else if (await foodsStep.isVisible()) {
      for (const food of foods) await screen.getByTestId(`own-food-${food}`).click();
      await screen.getByTestId("own-next").click();
      await screen.getByTestId("own-foods-confirm").click();
    } else await skip.click();
  }
}

test.describe("owner pets", () => {
  test("Add pet asks the sign-up questions for one pet and comes back to Home (#367)", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER]);
    await signIn(page, OWNER);
    await expect(page).toHaveURL(/\/owner$/);
    const screen = app(page);

    await screen.getByText("No pets yet").waitFor();
    await screen.getByRole("button", { name: "Add pet" }).click();
    await expect(page).toHaveURL(/\/owner-onboarding\?add=1$/);
    // One pet: its kind, then its name. No counts, no "Add a pet later".
    await expect(screen.getByTestId("own-step-species")).toBeVisible();
    await expect(screen.getByTestId("own-count-dog")).toHaveCount(0);
    await expect(screen.getByTestId("own-later")).toHaveCount(0);
    await screen.getByTestId("own-species-dog").click();
    await expect(screen.getByTestId("own-title")).toHaveText("What's your dog's name?");
    await screen.getByTestId("own-name").fill("Max");
    await screen.getByTestId("own-next").click();
    await screen.getByTestId("own-skip").click(); // photos
    await screen.getByTestId("own-skip").click(); // voice
    await screen.getByTestId("own-breed").fill("Maltese");
    await screen.getByTestId("own-next").click();
    await screen.getByTestId("own-coat-white").click();
    await screen.getByTestId("own-next").click(); // age
    await screen.getByTestId("own-weight").fill("6");
    await screen.getByTestId("own-next").click();
    // Add pet shows the 8-bit pet too.
    await expect(screen.getByTestId("own-title")).toHaveText("Meet Max");
    await screen.getByTestId("own-generate").click();
    await expect(screen.getByTestId("own-reveal-pet")).toBeVisible();
    await screen.getByTestId("own-next").click();
    await answerToSummary(page, ["chicken"]);
    // The owner's own questions were asked at sign-up, not again here.
    await expect(screen.getByTestId("own-row-about-you")).toHaveCount(0);
    await expect(screen.getByTestId("own-row-home")).toHaveCount(0);
    await screen.getByTestId("own-save").click();

    await expect(page).toHaveURL(/\/owner$/);
    await expect(screen.getByTestId("toast")).toContainText("Max is added");
    const max = screen.getByTestId("pet-card-Max");
    await expect(max).toContainText("Maltese");
    await expect(max).toContainText("chicken");

    // A second pet starts fresh, and Back on the first question goes back to Home with nothing saved.
    await screen.getByTestId("add-pet").click();
    await expect(screen.getByTestId("own-species-dog")).not.toHaveAttribute("aria-pressed", "true");
    await screen.getByTestId("own-back").click();
    await expect(page).toHaveURL(/\/owner$/);

    await screen.getByTestId("add-pet").click();
    await screen.getByTestId("own-species-cat").click();
    await screen.getByTestId("own-name").fill("Mochi");
    await screen.getByTestId("own-next").click();
    await answerToSummary(page);
    await screen.getByTestId("own-save").click();

    await expect(page).toHaveURL(/\/owner$/);
    await expect(screen.getByTestId("pet-card-Mochi")).toBeVisible();
    expect(db.pets.map((pet) => [pet.name, pet.species, pet.owner_id])).toEqual([
      ["Max", "dog", OWNER.id],
      ["Mochi", "cat", OWNER.id],
    ]);
    expect(db.pet_allergies.map((a) => a.allergen)).toEqual(["chicken"]);
  });

  test("an old link to the add form opens the questions", async ({ page }) => {
    await mockSupabase(page, [OWNER]);
    await signIn(page, OWNER);
    await expect(page).toHaveURL(/\/owner$/);
    await page.goto("/owner/pets/new");
    await expect(page).toHaveURL(/\/owner-onboarding\?add=1$/);
    await expect(app(page).getByTestId("own-step-species")).toBeVisible();
  });

  test("editing keeps the species locked and updates allergies", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER]);
    seedBori(db);
    await signIn(page, OWNER);
    const screen = app(page);

    await screen.getByTestId("pet-card-Max").click();
    await expect(page).toHaveURL(/\/owner\/pets\/pet-max$/);
    await expect(screen.getByTestId("pet-name")).toHaveValue("Max");
    await expect(screen.getByTestId("pet-species-cat")).toBeDisabled();
    await expect(screen.getByText("Species can't be changed after the pet is added.")).toBeVisible();

    await screen.getByTestId("pet-breed").fill("Maltipoo");
    await screen.getByRole("button", { name: "Remove chicken" }).click();
    await screen.getByTestId("pet-allergy-input").fill("beef");
    await screen.getByTestId("pet-allergy-input").press("Enter");
    await screen.getByTestId("pet-save").click();

    await expect(page).toHaveURL(/\/owner$/);
    await expect(screen.getByTestId("pet-card-Max")).toContainText("Maltipoo");
    await expect(screen.getByTestId("pet-card-Max")).toContainText("beef");
    expect(db.pets[0].species).toBe("dog");
    expect(db.pet_allergies.map((a) => a.allergen)).toEqual(["beef"]);
  });

  test("a pet profile opened by link survives a refresh", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER]);
    seedBori(db);
    await signIn(page, OWNER);
    await expect(page).toHaveURL(/\/owner$/);

    await page.goto("/owner/pets/pet-max");
    await expect(app(page).getByTestId("pet-name")).toHaveValue("Max");
    await page.reload();
    await expect(app(page).getByTestId("pet-name")).toHaveValue("Max");
    await expect(page).toHaveURL(/\/owner\/pets\/pet-max$/);
  });
});
