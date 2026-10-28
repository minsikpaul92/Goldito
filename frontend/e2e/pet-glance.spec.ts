import { expect, test } from "@playwright/test";

import { caring } from "./careFixtures";
import { app, signIn } from "./helpers";
import { OWNER, SITTER, mockSupabase } from "./supabaseMock";

// The "at a glance" card (11.15 S1, #185): a sitter on the booking, the owner on the pet, nothing for an undescribed pet.

const MAX = { id: "00000000-0000-4000-8000-0000000000aa", name: "Max", species: "dog" } as const;
const MOCHI = { id: "00000000-0000-4000-8000-0000000000bb", name: "Mochi", species: "cat" } as const;

const PROFILE = {
  v: 1,
  answers: { d1: 4, d2: 3, d3: 4, d4: 1, d5: 2, d6: 1, d7: 3, d8: 3 },
  safety: { s1: "once", s2: "unsure", s5: "medication" },
};

test.describe("pet at a glance", () => {
  test("the sitter sees the card on the booking: facts, warnings, levels, Not shared yet; an undescribed pet has none", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    caring(db, [MAX, MOCHI]);
    Object.assign(db.pets.find((p) => p.id === MAX.id)!, { breed: "Maltese", birthdate: "2020-01-01", weight_kg: 6, profile: PROFILE });
    db.pet_allergies.push({ id: "a1", pet_id: MAX.id, allergen: "chicken" });
    db.pet_photos.push({ id: "ph1", pet_id: MAX.id, public_id: "goldito/pet-profile/x/1", position: 0 });
    let asked: { species: string; breed: string } | null = null;
    await page.route("**/api/breed-needs", (route) => {
      asked = route.request().postDataJSON();
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          chips: [
            { kind: "grooming", text: "Brush daily", source: 0, quote: "brush the coat daily" },
            { kind: "care", text: "Prone to hip problems", source: 1, quote: null },
          ],
          sources: [
            { title: "Maltese | Example", url: "https://petcare.example/dog-breeds/maltese/" },
            { title: "Maltese | VCA", url: "https://vcahospitals.com/know-your-pet/maltese" },
          ],
          origin: "list",
          basis: null,
        }),
      });
    });
    await signIn(page, SITTER);
    await app(page).getByRole("heading", { name: /^(Home|Today)$/ }).first().waitFor();
    await page.goto("/sitter/bookings/b1");
    const screen = app(page);

    const card = screen.getByTestId(`glance-${MAX.id}`);
    await expect(card).toContainText("Max at a glance");
    await expect(card).toContainText("Dog · Maltese");
    await expect(card).toContainText("6 kg");
    await expect(card.getByTestId(`glance-${MAX.id}-chips`)).toContainText("Has snapped once");
    await expect(card.getByTestId(`glance-${MAX.id}-chips`)).toContainText("Owner isn't sure (other animals)");
    await expect(card.getByTestId(`glance-${MAX.id}-chips`)).toContainText("Daily medication");
    await expect(card.getByTestId(`glance-${MAX.id}-chips`)).toContainText("No chicken");
    const chart = card.getByTestId(`glance-${MAX.id}-chart`);
    await expect(chart).toContainText("Sociability");
    await expect(chart).toContainText("Social"); // (4 + 3 + 4) / 3 = 3.67, rounds to 4
    await expect(chart).toContainText("Unfazed"); // sensitivity (1 + 2 + 1) / 3
    await expect(chart).toContainText("Not shared yet"); // appetite and trainability were not answered
    // What the breed needs, with where it comes from: a lookup by species and breed, shown a moment later.
    const needs = card.getByTestId(`glance-${MAX.id}-needs`);
    await expect(needs).toContainText("Grooming: Brush daily");
    await expect(needs).toContainText("Watch for: Prone to hip problems");
    await expect(needs).toContainText("Source: petcare.example");
    await expect(needs).toContainText("Source: vcahospitals.com");
    expect(asked).toEqual({ species: "dog", breed: "Maltese" });
    await expect(card).toContainText("Owner's description, not an assessment.");
    await expect(card).not.toContainText("%");
    await expect(screen.getByTestId(`glance-${MOCHI.id}`)).toHaveCount(0);
  });

  test("a pet with only a cover photo still gets a card, and the owner sees it on the pet", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    caring(db, [MAX]);
    db.pet_photos.push({ id: "ph1", pet_id: MAX.id, public_id: "goldito/pet-profile/x/1", position: 0 });
    await signIn(page, OWNER);
    await app(page).getByRole("heading", { name: /^(Home|Today)$/ }).first().waitFor();
    await page.goto(`/owner/pets/${MAX.id}`);
    const card = app(page).getByTestId(`glance-${MAX.id}`);
    await expect(card).toContainText("Max at a glance");
    await expect(card).toContainText("Personality: not shared yet");
  });

  test("a breed that is not known shows no Needs lines and nothing else changes", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    caring(db, [MAX]);
    Object.assign(db.pets[0], { breed: "Xoloitzcuintli", profile: PROFILE });
    await page.route("**/api/breed-needs", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ chips: [], sources: [], origin: "none", basis: null }) }),
    );
    await signIn(page, OWNER);
    await app(page).getByRole("heading", { name: /^(Home|Today)$/ }).first().waitFor();
    await page.goto(`/owner/pets/${MAX.id}`);
    const card = app(page).getByTestId(`glance-${MAX.id}`);
    await expect(card).toContainText("Max at a glance");
    await expect(card.getByTestId(`glance-${MAX.id}-needs`)).toHaveCount(0);
  });
  test("the owner can change the photo from the avatar and retakes the personality questions on the pet", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    caring(db, [MAX]);
    Object.assign(db.pets[0], { profile: PROFILE });
    db.pet_photos.push({ id: "ph1", pet_id: MAX.id, public_id: "goldito/pet-profile/x/1", position: 0 });
    await signIn(page, OWNER);
    await app(page).getByRole("heading", { name: /^(Home|Today)$/ }).first().waitFor();
    await page.goto(`/owner/pets/${MAX.id}`);
    const screen = app(page);
    await expect(screen.getByTestId("pet-avatar-photo")).toBeVisible();
    await expect(screen.getByTestId("pet-avatar-edit")).toBeVisible();

    await screen.getByTestId("open-personality").click();
    await expect(screen.getByTestId("personality-d1-4")).toHaveAttribute("aria-pressed", "true");
    await screen.getByTestId("personality-d1-1").click();
    await screen.getByTestId("personality-save").click();
    await expect(screen.getByTestId("open-personality")).toBeVisible();
    expect((db.pets[0].profile as { answers: Record<string, number> }).answers.d1).toBe(1);
  });
});
