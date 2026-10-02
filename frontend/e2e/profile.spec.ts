import { expect, test } from "@playwright/test";

import { app, signIn } from "./helpers";
import { OWNER, SITTER, mockSupabase } from "./supabaseMock";

// Role profiles (phase-03 3.8).

test.describe("profile", () => {
  test("an owner saves an emergency contact and a new name", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER]);
    await signIn(page, OWNER);
    await expect(page).toHaveURL(/\/owner$/);
    const screen = app(page);

    await screen.getByTestId("open-profile").click();
    await expect(page).toHaveURL(/\/profile$/);
    await expect(screen.getByTestId("profile-display_name")).toHaveValue(OWNER.displayName);
    await expect(screen.getByTestId("profile-bio")).toHaveCount(0);

    await screen.getByTestId("profile-display_name").fill("Chloe Park");
    await screen.getByTestId("profile-emergency_contact_name").fill("Min");
    await screen.getByTestId("profile-emergency_contact_phone").fill("416-555-0100");
    await screen.getByTestId("profile-save").click();

    await expect(screen.getByTestId("toast")).toContainText("Profile saved");
    await expect(page).toHaveURL(/\/owner$/);
    const row = db.owner_profiles.find((r) => r.id === OWNER.id);
    expect(row?.emergency_contact_name).toBe("Min");
    expect(row?.emergency_contact_phone).toBe("416-555-0100");
    expect(row?.home_address).toBeNull();

    await screen.getByTestId("open-profile").click();
    await expect(screen.getByTestId("profile-display_name")).toHaveValue("Chloe Park");
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
    });
    await signIn(page, SITTER);
    await expect(page).toHaveURL(/\/sitter$/);
    const screen = app(page);

    await screen.getByTestId("open-profile").click();
    await expect(screen.getByTestId("profile-home_address")).toHaveValue("12 Maple St");

    await screen.getByTestId("profile-experience_years").fill("two");
    await screen.getByTestId("profile-save").click();
    await expect(screen.getByText("Enter whole years, e.g. 3.")).toBeVisible();

    await screen.getByTestId("profile-experience_years").fill("3");
    await screen.getByTestId("profile-service_area").fill("North York");
    await screen.getByTestId("profile-save").click();
    await expect(page).toHaveURL(/\/sitter$/);
    const row = db.sitter_profiles.find((r) => r.id === SITTER.id);
    expect(row).toMatchObject({ service_area: "North York", experience_years: 3, home_address: "12 Maple St" });
  });

  test("signed-out visitors cannot open the profile", async ({ page }) => {
    await mockSupabase(page, [OWNER]);
    await page.goto("/profile");
    await expect(page).toHaveURL(/\/login$/);
  });
});
