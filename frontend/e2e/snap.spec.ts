import { Page, expect, test } from "@playwright/test";

import { app, signIn } from "./helpers";
import { MockUser, OWNER, SITTER, mockSupabase } from "./supabaseMock";

// Snap tab (Phase 12.0, D61): three tool cards for both roles, each opening its own screen.

// `screen` / `text`: what the tool screen shows — Treat check (12.1c; no pets here → its empty state) and Mood (12.2b) are built.
const TOOLS = [
  { key: "treat", title: "Treat check", screen: "treat-no-pets", text: "Add a pet first" },
  { key: "mood", title: "Mood", screen: "mood", text: "For fun only" },
  { key: "sticker", title: "Sticker", screen: "snap-tool-sticker", text: "Sticker" },
];

async function openSnap(page: Page, user: MockUser) {
  await mockSupabase(page, [OWNER, SITTER]);
  await signIn(page, user);
  await expect(page).toHaveURL(user.role === "owner" ? /\/owner$/ : /\/sitter$/);
  const screen = app(page);
  await screen.getByRole("tab").getByText("Snap", { exact: true }).click();
  await expect(screen.getByTestId("snap")).toBeVisible();
  return screen;
}

test.describe("snap tab", () => {
  test("an owner sees the three tools and each opens its own screen", async ({ page }) => {
    const screen = await openSnap(page, OWNER);
    for (const tool of TOOLS) {
      await expect(screen.getByTestId(`snap-card-${tool.key}`)).toContainText(tool.title);
    }
    for (const tool of TOOLS) {
      await screen.getByTestId(`snap-card-${tool.key}`).click();
      await expect(page).toHaveURL(new RegExp(`/owner/snap/${tool.key}$`));
      await expect(screen.getByTestId(tool.screen)).toContainText(tool.text);
      await page.goBack();
      await expect(screen.getByTestId("snap")).toBeVisible();
    }
  });

  test("a sitter has the same tools", async ({ page }) => {
    const screen = await openSnap(page, SITTER);
    await expect(screen.getByTestId("snap-card-treat")).toBeVisible();
    await expect(screen.getByTestId("snap-card-mood")).toBeVisible();
    await screen.getByTestId("snap-card-sticker").click();
    await expect(page).toHaveURL(/\/sitter\/snap\/sticker$/);
    await expect(screen.getByTestId("snap-tool-sticker")).toContainText("Sticker");
  });
});
