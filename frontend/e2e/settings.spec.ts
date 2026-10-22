import { expect, test } from "@playwright/test";

import app_json from "../app.json";
import changelog from "../features/settings/changelog.json";
import { app, signIn } from "./helpers";
import { OWNER, SITTER, mockSupabase } from "./supabaseMock";

// Menu → Settings (11.11, Figma D · Profile → Settings): the account, What's New, notifications, Privacy, the app version and Sign out.
// What's New: every CHANGELOG release with items (the build-up shows for now), never the planned ones.

for (const user of [OWNER, SITTER]) {
  test(`${user.role}: Menu → Settings has the account, Privacy and the version, and the Name row opens Profile`, async ({ page }) => {
    await mockSupabase(page, [OWNER, SITTER]);
    await signIn(page, user);
    await expect(page).toHaveURL(user.role === "owner" ? /\/owner$/ : /\/sitter$/);
    const screen = app(page);

    await screen.getByTestId("open-menu").click();
    await screen.getByTestId("open-settings").click();
    await expect(page).toHaveURL(/\/settings$/);
    await expect(screen.getByTestId("settings-account")).toContainText(user.role === "owner" ? "Owner" : "Sitter");
    await expect(screen.getByTestId("settings-notifications")).toContainText("Trip updates");
    await expect(screen.getByTestId("settings-version")).toHaveText(`Goldito ${app_json.expo.version}`);
    await expect(screen.getByTestId("settings-whats-new")).toContainText("What's New");

    await screen.getByTestId("settings-edit-profile").click();
    await expect(page).toHaveURL(/\/profile$/);
    // Profile is for editing only: no Settings, What's New or Privacy links at the bottom.
    await expect(screen.getByTestId("profile-save")).toBeVisible();
    await expect(screen.getByTestId("profile-settings")).toHaveCount(0);
    await expect(screen.getByTestId("profile-privacy")).toHaveCount(0);
  });

  test(`${user.role}: Menu → What's new lists the releases, or says nothing is new yet`, async ({ page }) => {
    await mockSupabase(page, [OWNER, SITTER]);
    await signIn(page, user);
    await expect(page).toHaveURL(user.role === "owner" ? /\/owner$/ : /\/sitter$/);
    const screen = app(page);

    await screen.getByTestId("open-menu").click();
    await screen.getByTestId("menu-whats-new").click();
    await expect(page).toHaveURL(/\/whats-new$/);
    if (changelog.length === 0) {
      await expect(screen.getByText("Nothing new yet")).toBeVisible();
    } else {
      await expect(screen.getByTestId(`release-${changelog[0].version}`)).toContainText(changelog[0].sections[0].items[0]);
    }
    await expect(screen.getByText(/Planned/)).toHaveCount(0);
  });
}
