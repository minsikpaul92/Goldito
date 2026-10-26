import { expect, test } from "@playwright/test";

import { app } from "./helpers";
import { OWNER, SITTER, mockSupabase } from "./supabaseMock";

// Expressive is the app's look; `?skin=default` brings back the earlier one for debugging.

const CREAM = "rgb(251, 246, 234)";
const OLD_BACKGROUND = "rgb(247, 247, 245)";

async function signInAs(page: import("@playwright/test").Page, query: string) {
  await mockSupabase(page, [OWNER, SITTER]);
  await page.goto(`/login${query}`);
  await app(page).getByTestId("login-email").fill(OWNER.email);
  await app(page).getByTestId("login-password").fill(OWNER.password);
  await app(page).getByRole("button", { name: "Log in", exact: true }).click();
}

/** The screen background and the header title font of the Bookings tab. */
async function look(page: import("@playwright/test").Page) {
  await app(page).getByRole("tab", { name: /Bookings/ }).click();
  const title = app(page).getByRole("heading", { name: "Bookings" });
  await expect(title).toBeVisible();
  return {
    font: await title.evaluate((el) => getComputedStyle(el).fontFamily),
    backgrounds: await title.evaluate((el) =>
      [...el.ownerDocument.querySelectorAll("div")].map((div) => getComputedStyle(div).backgroundColor),
    ),
  };
}

test.describe("skins", () => {
  test("with no switch the app is cream with Fredoka titles", async ({ page }) => {
    await signInAs(page, "");
    await expect.poll(async () => (await look(page)).font).toContain("Fredoka");
    const { backgrounds } = await look(page);
    expect(backgrounds).toContain(CREAM);
    expect(backgrounds).not.toContain(OLD_BACKGROUND);
  });

  test("?skin=default brings back the earlier look and keeps it after a reload", async ({ page }) => {
    await signInAs(page, "?skin=default");
    let current = await look(page);
    expect(current.font).not.toContain("Fredoka");
    expect(current.backgrounds).toContain(OLD_BACKGROUND);
    expect(current.backgrounds).not.toContain(CREAM);

    await page.reload();
    current = await look(page);
    expect(current.font).not.toContain("Fredoka");
    expect(current.backgrounds).toContain(OLD_BACKGROUND);
  });
});
