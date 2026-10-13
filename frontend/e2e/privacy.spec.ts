import { expect, test } from "@playwright/test";

import { app, signIn } from "./helpers";
import { OWNER, SITTER, mockSupabase } from "./supabaseMock";

// Privacy page (10.11): public, so the Google consent screen and a signed-out visitor can read it.

test.describe("privacy page", () => {
  test("opens signed out from Welcome and lists what is stored and who else receives it", async ({ page }) => {
    await mockSupabase(page, [OWNER, SITTER]);
    await page.goto("/welcome");
    const screen = app(page);

    await screen.getByTestId("welcome-privacy").click();
    await expect(page).toHaveURL(/\/privacy$/);
    await expect(screen.getByTestId("privacy")).toContainText("Last updated");
    await expect(screen.getByTestId("privacy-what-we-store")).toContainText("Supabase database");
    await expect(screen.getByTestId("privacy-ai")).toContainText("Nebius Token Factory");
    await expect(screen.getByTestId("privacy-ai")).toContainText("Entry codes are never sent to a model.");
    // The saved home address goes to OpenStreetMap's Nominatim once, to place the pin.
    await expect(screen.getByTestId("privacy-other-services-that-receive-data")).toContainText("Nominatim");
    // What the Google OAuth consent screen's privacy link must find: the Calendar use and the Limited Use statement.
    await expect(screen.getByTestId("privacy-google-calendar-and-meet")).toContainText("calendar.events");
    await expect(screen.getByTestId("privacy-google-calendar-and-meet")).toContainText("Limited Use requirements");
  });

  test("a signed-in person can open it from Profile and a direct link stays on the page", async ({ page }) => {
    await mockSupabase(page, [OWNER]);
    await signIn(page, OWNER);
    await expect(page).toHaveURL(/\/owner$/);
    const screen = app(page);

    await screen.getByTestId("open-profile").click();
    await screen.getByTestId("profile-privacy").click();
    await expect(page).toHaveURL(/\/privacy$/);
    await expect(screen.getByTestId("privacy")).toBeVisible();

    await page.reload(); // opened directly, still no redirect to a role home
    await expect(page).toHaveURL(/\/privacy$/);
    await expect(screen.getByTestId("privacy")).toBeVisible();
  });
});
