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

test.describe("owner pets", () => {
  test("adds Max (dog, chicken allergy) and Mochi (cat) and shows both on Home", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER]);
    await signIn(page, OWNER);
    await expect(page).toHaveURL(/\/owner$/);
    const screen = app(page);

    await screen.getByText("No pets yet").waitFor();
    await screen.getByRole("button", { name: "Add pet" }).click();
    await expect(page).toHaveURL(/\/owner\/pets\/new$/);
    await screen.getByTestId("pet-species-dog").click();
    // Screen readers must hear which species is selected.
    await expect(screen.getByTestId("pet-species-dog")).toHaveAttribute("aria-checked", "true");
    await expect(screen.getByTestId("pet-species-cat")).toHaveAttribute("aria-checked", "false");
    await screen.getByTestId("pet-name").fill("Max");
    await screen.getByTestId("pet-breed").fill("Maltese");
    await screen.getByTestId("pet-birthdate").fill("2022-04-15");
    await screen.getByTestId("pet-weight").fill("3.2");
    await screen.getByTestId("pet-allergy-input").fill(" Chicken ");
    await screen.getByTestId("pet-allergy-add").click();
    await expect(screen.getByTestId("allergy-chicken")).toBeVisible();
    await screen.getByTestId("pet-save").click();

    await expect(page).toHaveURL(/\/owner$/);
    await expect(screen.getByTestId("toast")).toContainText("Max is added");
    const max = screen.getByTestId("pet-card-Max");
    await expect(max).toContainText("🐶");
    await expect(max).toContainText("Dog · Maltese");
    await expect(max).toContainText("3.2 kg");
    await expect(max).toContainText("chicken");

    await screen.getByRole("button", { name: "Add pet" }).click();
    await screen.getByTestId("pet-species-cat").click();
    await screen.getByTestId("pet-name").fill("Mochi");
    await screen.getByTestId("pet-breed").fill("Domestic Shorthair");
    await screen.getByTestId("pet-save").click();

    await expect(page).toHaveURL(/\/owner$/);
    await expect(screen.getByTestId("pet-card-Mochi")).toContainText("🐱");
    await expect(screen.getByTestId("pet-card-Mochi")).toContainText("Cat · Domestic Shorthair");
    expect(db.pets.map((pet) => [pet.name, pet.species, pet.owner_id])).toEqual([
      ["Max", "dog", OWNER.id],
      ["Mochi", "cat", OWNER.id],
    ]);
    expect(db.pet_allergies.map((a) => a.allergen)).toEqual(["chicken"]);
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

  test("the form explains what is missing and saves nothing", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER]);
    await signIn(page, OWNER);
    const screen = app(page);
    await screen.getByRole("button", { name: "Add pet" }).click();

    await screen.getByTestId("pet-birthdate").fill("2022-13-40");
    await screen.getByTestId("pet-weight").fill("heavy");
    await screen.getByTestId("pet-save").click();
    await expect(screen.getByText("Choose dog or cat.")).toBeVisible();
    await expect(screen.getByText("Enter your pet's name.")).toBeVisible();
    await expect(screen.getByText("Use YYYY-MM-DD, e.g. 2022-04-15.")).toBeVisible();
    await expect(screen.getByText("Enter the weight in kg, e.g. 3.2.")).toBeVisible();

    await screen.getByTestId("pet-allergy-input").fill("chicken");
    await screen.getByTestId("pet-allergy-add").click();
    await screen.getByTestId("pet-allergy-input").fill("CHICKEN");
    await screen.getByTestId("pet-allergy-add").click();
    await expect(screen.getByText("chicken is already on the list.")).toBeVisible();

    await expect(page).toHaveURL(/\/owner\/pets\/new$/);
    expect(db.pets).toEqual([]);
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
