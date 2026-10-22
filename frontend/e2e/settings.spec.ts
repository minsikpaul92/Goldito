import { expect, test } from "@playwright/test";

import app_json from "../app.json";
import changelog from "../features/settings/changelog.json";
import { app, signIn } from "./helpers";
import { OWNER, SITTER, mockSupabase } from "./supabaseMock";

// Menu → Settings (11.11): the account with Edit profile, a notifications note, Privacy, the app version and Sign out.
// Menu → What's new: what shipped after launch (CHANGELOG 1.0.0 and later), never the build-up or the planned ones.

for (const user of [OWNER, SITTER]) {
  test(`${user.role}: Menu → Settings has the account, Privacy and the version, and Edit profile opens Profile`, async ({ page }) => {
    await mockSupabase(page, [OWNER, SITTER]);
    await signIn(page, user);
    await expect(page).toHaveURL(user.role === "owner" ? /\/owner$/ : /\/sitter$/);
    const screen = app(page);

    await screen.getByTestId("open-menu").click();
    await screen.getByTestId("open-settings").click();
    await expect(page).toHaveURL(/\/settings$/);
    await expect(screen.getByTestId("settings-account")).toContainText(user.role === "owner" ? "Pet owner" : "Pet sitter");
    await expect(screen.getByTestId("settings-notifications")).toContainText("not available yet");
    await expect(screen.getByTestId("settings-version")).toHaveText(`Goldito ${app_json.expo.version}`);
    await expect(screen.getByText("What's New")).toHaveCount(0); // its own screen in the menu

    await screen.getByTestId("settings-edit-profile").click();
    await expect(page).toHaveURL(/\/profile$/);
    // Profile is for editing only: no Settings, What's New or Privacy links at the bottom.
    await expect(screen.getByTestId("profile-save")).toBeVisible();
    await expect(screen.getByTestId("profile-settings")).toHaveCount(0);
    await expect(screen.getByTestId("profile-privacy")).toHaveCount(0);
  });

  test(`${user.role}: Menu → What's new shows only post-launch releases, or says nothing is new yet`, async ({ page }) => {
    await mockSupabase(page, [OWNER, SITTER]);
    await signIn(page, user);
    await expect(page).toHaveURL(user.role === "owner" ? /\/owner$/ : /\/sitter$/);
    const screen = app(page);

    await screen.getByTestId("open-menu").click();
    await screen.getByTestId("menu-whats-new").click();
    await expect(page).toHaveURL(/\/whats-new$/);
    for (const release of changelog) {
      expect(Number.parseInt(release.version, 10)).toBeGreaterThanOrEqual(1);
    }
    if (changelog.length === 0) {
      await expect(screen.getByText("Nothing new yet")).toBeVisible();
    } else {
      await expect(screen.getByTestId(`release-${changelog[0].version}`)).toContainText(changelog[0].sections[0].items[0]);
    }
    await expect(screen.getByText(/Planned/)).toHaveCount(0);
  });
}
