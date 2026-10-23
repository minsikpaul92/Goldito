import { expect, test } from "@playwright/test";

import { app, signIn } from "./helpers";
import { OWNER, SITTER, mockSupabase } from "./supabaseMock";

// Role profiles (phase-03 3.8).

test.describe("profile", () => {
  test("an owner saves an emergency contact and a new name", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER]);
    db.owner_profiles.push({ id: OWNER.id, home_address: "1 Test St, Toronto, ON", home_lat: 43.65, home_lng: -79.38 });
    await signIn(page, OWNER);
    await expect(page).toHaveURL(/\/owner$/);
    const screen = app(page);

    await screen.getByTestId("open-menu").click();
    await screen.getByTestId("open-profile").click();
    await expect(page).toHaveURL(/\/profile$/);
    await expect(screen.getByTestId("profile-display_name")).toHaveValue(OWNER.displayName);
    await expect(screen.getByTestId("profile-bio")).toHaveCount(0);

    await screen.getByTestId("profile-display_name").fill("Robert Park");
    await screen.getByTestId("profile-add-emergency").click();
    await screen.getByTestId("profile-emergency_contact_name").fill("Min");
    await screen.getByTestId("profile-emergency_contact_phone").fill("416-555-0100");
    await screen.getByTestId("profile-save").click();

    await expect(screen.getByTestId("toast")).toContainText("Profile saved");
    await expect(page).toHaveURL(/\/profile$/);
    const row = db.owner_profiles.find((r) => r.id === OWNER.id);
    expect(row?.emergency_contact_name).toBe("Min");
    expect(row?.emergency_contact_phone).toBe("416-555-0100");
    expect(row?.home_address).toBe("1 Test St, Toronto, ON");

    await expect(screen.getByTestId("profile-display_name")).toHaveValue("Robert Park");
    await expect(screen.getByTestId("profile-group-emergency")).toContainText("Min");
    await screen.getByTestId("profile-add-emergency").click();
    await expect(screen.getByTestId("profile-emergency_contact_name")).toHaveValue("Min");
  });

  test("a sitter's home address comes from get_my_sitter_profile and saves", async ({ page }) => {
    const { db } = await mockSupabase(page, [SITTER]);
    db.sitter_profiles.push({
      id: SITTER.id,
      bio: null,
      service_area: null,
      experience_years: null,
      home_notes: null,
      home_address: "12 Maple St",
      home_lat: 43.6477,
      home_lng: -79.4194,
    });
    await signIn(page, SITTER);
    await expect(page).toHaveURL(/\/sitter$/);
    const screen = app(page);

    await screen.getByTestId("open-menu").click();
    await screen.getByTestId("open-profile").click();
    // Every optional card starts closed and shows its value under the title.
    await expect(screen.getByTestId("profile-home_address")).toHaveCount(0);
    await expect(screen.getByTestId("profile-group-home")).toContainText("12 Maple St");
    await screen.getByTestId("profile-add-home").click();
    await expect(screen.getByTestId("profile-home_address")).toHaveValue("12 Maple St");

    await screen.getByTestId("profile-add-experience").click();
    await screen.getByTestId("profile-experience_years").fill("two");
    await screen.getByTestId("profile-save").click();
    await expect(screen.getByText("Enter whole years, e.g. 3.")).toBeVisible();

    await screen.getByTestId("profile-experience_years").fill("3");
    await screen.getByTestId("profile-save").click();
    await expect(screen.getByTestId("toast")).toContainText("Profile saved");
    const row = db.sitter_profiles.find((r) => r.id === SITTER.id);
    expect(row).toMatchObject({ experience_years: 3, home_address: "12 Maple St" });
  });

  test("a sitter picks services and meeting spots; at least one service is required", async ({ page }) => {
    const { db } = await mockSupabase(page, [SITTER]);
    db.sitter_profiles.push({ id: SITTER.id, bio: null, service_area: null, experience_years: null, home_notes: null, home_address: "12 Maple St", home_lat: 43.6477, home_lng: -79.4194 });
    await signIn(page, SITTER);
    await expect(page).toHaveURL(/\/sitter$/);
    const screen = app(page);
    await screen.getByTestId("open-menu").click();
    await screen.getByTestId("open-profile").click();

    // New sitters offer boarding by default (004).
    await expect(screen.getByTestId("profile-service-boarding")).toHaveAttribute("aria-checked", "true");
    await screen.getByTestId("profile-service-boarding").click();
    await screen.getByTestId("profile-save").click();
    await expect(screen.getByText("Pick at least one service.")).toBeVisible();

    await screen.getByTestId("profile-service-house_sitting").click();
    await screen.getByTestId("profile-add-spots").click();
    await screen.getByTestId("profile-spot-1").fill("Christie Pits — east entrance");
    await expect(screen.getByTestId("profile-spot-2")).toHaveCount(0); // one field to start
    await screen.getByTestId("profile-add-spot").click();
    await screen.getByTestId("profile-spot-2").fill("  christie pits — east entrance ");
    await screen.getByTestId("profile-save").click();
    await expect(screen.getByTestId("toast")).toContainText("Profile saved");
    expect(db.sitter_profiles.find((r) => r.id === SITTER.id)).toMatchObject({
      services: ["house_sitting"],
      meet_spots: ["Christie Pits — east entrance"],
    });
  });

  test("a sitter chooses between one owner at a time (default) and several owners", async ({ page }) => {
    const { db } = await mockSupabase(page, [SITTER]);
    db.sitter_profiles.push({ id: SITTER.id, bio: null, service_area: null, experience_years: null, home_notes: null, home_address: "12 Maple St", home_lat: 43.6477, home_lng: -79.4194 });
    await signIn(page, SITTER);
    await expect(page).toHaveURL(/\/sitter$/);
    const screen = app(page);
    await screen.getByTestId("open-menu").click();
    await screen.getByTestId("open-profile").click();

    await expect(screen.getByTestId("profile-multi-owner")).toHaveAttribute("aria-checked", "false");
    await screen.getByTestId("profile-multi-owner").click();
    await screen.getByTestId("profile-save").click();
    await expect(screen.getByTestId("toast")).toContainText("Profile saved");
    expect(db.sitter_profiles.find((r) => r.id === SITTER.id)).toMatchObject({ accepts_multiple_owners: true });
  });

  test("an owner saves preferred meeting spots", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER]);
    db.owner_profiles.push({ id: OWNER.id, home_address: "1 Test St, Toronto, ON", home_lat: 43.65, home_lng: -79.38 });
    await signIn(page, OWNER);
    await expect(page).toHaveURL(/\/owner$/);
    const screen = app(page);
    await screen.getByTestId("open-menu").click();
    await screen.getByTestId("open-profile").click();
    await expect(screen.getByTestId("profile-services")).toHaveCount(0);
    await screen.getByTestId("profile-add-spots").click();
    await screen.getByTestId("profile-spot-1").fill("Trinity Bellwoods — north gate");
    await screen.getByTestId("profile-save").click();
    await expect(screen.getByTestId("toast")).toContainText("Profile saved");
    expect(db.owner_profiles.find((r) => r.id === OWNER.id)?.meet_spots).toEqual(["Trinity Bellwoods — north gate"]);
  });

  test("an owner saves address details and a postal code apart from the street", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER]);
    db.owner_profiles.push({ id: OWNER.id, home_address: "1 Test St, Toronto, ON", home_lat: 43.65, home_lng: -79.38 });
    await signIn(page, OWNER);
    await expect(page).toHaveURL(/\/owner$/);
    const screen = app(page);
    await screen.getByTestId("open-menu").click();
    await screen.getByTestId("open-profile").click();
    await screen.getByTestId("profile-add-home").click();
    await screen.getByTestId("profile-home_postal_code").fill("m5a 3c4");
    await screen.getByTestId("profile-home_address_2").fill("Unit 1204, buzz 55");
    await screen.getByTestId("profile-save").click();
    await expect(screen.getByTestId("toast")).toContainText("Profile saved");
    expect(db.owner_profiles.find((r) => r.id === OWNER.id)).toMatchObject({
      home_address: "1 Test St, Toronto, ON",
      home_postal_code: "m5a 3c4",
      home_address_2: "Unit 1204, buzz 55",
    });
  });

  test("an address saved with its postal code inside is shown split and saved split", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER]);
    db.owner_profiles.push({ id: OWNER.id, home_address: "1 Test St, Toronto, ON M5A 3C4", home_lat: 43.65, home_lng: -79.38 });
    await signIn(page, OWNER);
    await expect(page).toHaveURL(/\/owner$/);
    const screen = app(page);
    await screen.getByTestId("open-menu").click();
    await screen.getByTestId("open-profile").click();
    await screen.getByTestId("profile-add-home").click();
    await expect(screen.getByTestId("profile-home_address")).toHaveValue("1 Test St, Toronto, ON");
    await expect(screen.getByTestId("profile-home_postal_code")).toHaveValue("M5A 3C4");
    await screen.getByTestId("profile-save").click();
    await expect(screen.getByTestId("toast")).toContainText("Profile saved");
    expect(db.owner_profiles.find((r) => r.id === OWNER.id)).toMatchObject({
      home_address: "1 Test St, Toronto, ON",
      home_postal_code: "M5A 3C4",
    });
  });

  test("an owner writes a packing list that is saved as items", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER]);
    db.owner_profiles.push({ id: OWNER.id, home_address: "1 Test St, Toronto, ON", home_lat: 43.65, home_lng: -79.38 });
    await signIn(page, OWNER);
    await expect(page).toHaveURL(/\/owner$/);
    const screen = app(page);
    await screen.getByTestId("open-menu").click();
    await screen.getByTestId("open-profile").click();
    await screen.getByTestId("profile-add-packing").click();
    await screen.getByTestId("profile-packing-1").fill("Food");
    await screen.getByTestId("profile-packing-add").click();
    await screen.getByTestId("profile-packing-2").fill("Leash");
    await screen.getByTestId("profile-packing-add").click();
    await screen.getByTestId("profile-packing-remove-3").click();
    await expect(screen.getByTestId("profile-packing-3")).toHaveCount(0);
    await screen.getByTestId("profile-save").click();
    await expect(screen.getByTestId("toast")).toContainText("Profile saved");
    expect(db.owner_profiles.find((r) => r.id === OWNER.id)?.packing_list).toEqual(["Food", "Leash"]);
  });

  test("a sitter's profile has no packing list", async ({ page }) => {
    const { db } = await mockSupabase(page, [SITTER]);
    db.sitter_profiles.push({ id: SITTER.id, home_address: "12 Maple St", home_lat: 43.6477, home_lng: -79.4194 });
    await signIn(page, SITTER);
    await expect(page).toHaveURL(/\/sitter$/);
    const screen = app(page);
    await screen.getByTestId("open-menu").click();
    await screen.getByTestId("open-profile").click();
    await expect(screen.getByTestId("profile-display_name")).toBeVisible();
    await expect(screen.getByTestId("profile-add-packing")).toHaveCount(0);
  });

  test("a meeting spot can be removed", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER]);
    db.owner_profiles.push({ id: OWNER.id, home_address: "1 Test St, Toronto, ON", home_lat: 43.65, home_lng: -79.38 });
    await signIn(page, OWNER);
    await expect(page).toHaveURL(/\/owner$/);
    const screen = app(page);
    await screen.getByTestId("open-menu").click();
    await screen.getByTestId("open-profile").click();
    await screen.getByTestId("profile-add-spots").click();
    await screen.getByTestId("profile-spot-1").fill("Christie Pits");
    await screen.getByTestId("profile-add-spot").click();
    await screen.getByTestId("profile-spot-2").fill("Trinity Bellwoods");
    await screen.getByTestId("profile-spot-remove-1").click();
    await expect(screen.getByTestId("profile-spot-2")).toHaveCount(0);
    await expect(screen.getByTestId("profile-spot-1")).toHaveValue("Trinity Bellwoods");
    await screen.getByTestId("profile-save").click();
    await expect(screen.getByTestId("toast")).toContainText("Profile saved");
    expect(db.owner_profiles.find((r) => r.id === OWNER.id)?.meet_spots).toEqual(["Trinity Bellwoods"]);
  });

  test("signed-out visitors cannot open the profile", async ({ page }) => {
    await mockSupabase(page, [OWNER]);
    await page.goto("/profile");
    await expect(page).toHaveURL(/\/welcome$/);
  });
});
