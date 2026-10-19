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
    // "What this is" is open first; the others are closed but still in the page.
    await expect(screen.getByTestId("privacy-what-this-is")).toContainText("prototype");
    await expect(screen.getByTestId("privacy-what-we-store")).toContainText("Supabase database");
    await expect(screen.getByText("Supabase database", { exact: false })).toBeHidden();

    // One section open at a time.
    await screen.getByTestId("privacy-what-we-store-toggle").click();
    await expect(screen.getByText("Supabase database", { exact: false })).toBeVisible();
    await expect(screen.getByText("It is a prototype", { exact: false })).toBeHidden();

    await screen.getByTestId("privacy-ai-toggle").click();
    await expect(screen.getByTestId("privacy-ai")).toContainText("Nebius Token Factory");
    await expect(screen.getByTestId("privacy-ai")).toContainText("Entry codes are never sent to a model.");
    await expect(screen.getByText("Supabase database", { exact: false })).toBeHidden();

    // The saved home address goes to OpenStreetMap's Nominatim once, to place the pin.
    await screen.getByTestId("privacy-other-services-that-receive-data-toggle").click();
    await expect(screen.getByTestId("privacy-other-services-that-receive-data")).toContainText("Nominatim");

    // What the Google OAuth consent screen's privacy link must find: the Calendar use and the Limited Use statement.
    await screen.getByTestId("privacy-google-calendar-and-meet-toggle").click();
    await expect(screen.getByTestId("privacy-google-calendar-and-meet")).toContainText("calendar.events");
    await expect(screen.getByTestId("privacy-google-calendar-and-meet")).toContainText("Limited Use requirements");
    await expect(screen.getByText("Limited Use requirements", { exact: false })).toBeVisible();
  });

  test("the Google section opens from a deep link, for the consent-screen reviewer", async ({ page }) => {
    await mockSupabase(page, [OWNER, SITTER]);
    await page.goto("/privacy?open=google-calendar-and-meet");
    const screen = app(page);

    await expect(screen.getByText("Limited Use requirements", { exact: false })).toBeVisible();
    await expect(screen.getByText("It is a prototype", { exact: false })).toBeHidden();
  });

  test("a signed-in person can open it from Settings and a direct link stays on the page", async ({ page }) => {
    await mockSupabase(page, [OWNER]);
    await signIn(page, OWNER);
    await expect(page).toHaveURL(/\/owner$/);
    const screen = app(page);

    await screen.getByTestId("open-menu").click();
    await screen.getByTestId("open-settings").click();
    await screen.getByTestId("settings-privacy").click();
    await expect(page).toHaveURL(/\/privacy$/);
    await expect(screen.getByTestId("privacy")).toBeVisible();

    await page.reload(); // opened directly, still no redirect to a role home
    await expect(page).toHaveURL(/\/privacy$/);
    await expect(screen.getByTestId("privacy")).toBeVisible();
  });
});
