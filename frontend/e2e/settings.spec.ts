import { expect, test } from "@playwright/test";

import app_json from "../app.json";
import changelog from "../features/settings/changelog.json";
import { app, signIn } from "./helpers";
import { OWNER, SITTER, mockSupabase } from "./supabaseMock";

// Settings · What's New (11.11): Profile → Settings shows the account, a notifications note, the released
// CHANGELOG entries (never the planned ones) and the app version.

const latest = changelog[0];

for (const user of [OWNER, SITTER]) {
  test(`${user.role}: Profile → Settings shows What's New from the CHANGELOG and the version`, async ({ page }) => {
    await mockSupabase(page, [OWNER, SITTER]);
    await signIn(page, user);
    await expect(page).toHaveURL(user.role === "owner" ? /\/owner$/ : /\/sitter$/);
    await page.goto("/profile");
    const screen = app(page);

    await screen.getByTestId("profile-settings").click();
    await expect(page).toHaveURL(/\/settings$/);
    await expect(screen.getByTestId("settings-account")).toContainText(user.role === "owner" ? "Pet owner" : "Pet sitter");
    await expect(screen.getByTestId("settings-notifications")).toContainText("not available yet");

    const release = screen.getByTestId(`settings-release-${latest.version}`);
    await expect(release).toContainText(latest.sections[0].items[0]);
    await expect(screen.getByText(/Planned/)).toHaveCount(0);
    await expect(screen.getByTestId("settings-version")).toHaveText(`Goldito ${app_json.expo.version}`);
  });
}
