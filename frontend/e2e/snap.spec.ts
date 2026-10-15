import { Page, expect, test } from "@playwright/test";

import { app, signIn } from "./helpers";
import { MockUser, OWNER, SITTER, mockSupabase } from "./supabaseMock";

// Snap tab (Phase 12.0, D61): three tool cards for both roles, each opening its own screen.

// `screen` / `text`: what each tool screen shows to an owner with no pets yet (12.1c · 12.2b · 12.3a).
const TOOLS = [
  { key: "treat", title: "Treat check", screen: "treat-no-pets", text: "Add a pet first" },
  { key: "mood", title: "Mood", screen: "mood", text: "For fun only" },
  { key: "sticker", title: "Sticker", screen: "sticker-no-pets", text: "Add a pet first" },
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
    await expect(screen.getByTestId("sticker-no-pets")).toContainText("No pet in your care right now");
  });

  test("the newest three treat checks are listed, and a row opens that check", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    const MAX = "00000000-0000-4000-8000-0000000000aa";
    db.pets.push({ id: MAX, owner_id: OWNER.id, species: "dog", name: "Max", breed: null, notes: null });
    const days = ["01", "02", "03", "04"];
    days.forEach((d, i) =>
      db.safety_checks.push({
        id: `00000000-0000-4000-8000-00000000c00${i}`,
        pet_id: MAX,
        checked_by: OWNER.id,
        media_id: null,
        safety_status: "SAFE",
        result_json: { safety_status: "SAFE", product_name: `Treat ${d}`, warning_message: "" },
        acknowledged_at: null,
        created_at: `2026-10-${d}T10:00:00Z`,
      }),
    );
    await signIn(page, OWNER);
    await expect(page).toHaveURL(/\/owner$/);
    const screen = app(page);
    await screen.getByRole("tab").getByText("Snap", { exact: true }).click();
    const rows = screen.getByTestId("snap-recent-row");
    await expect(rows).toHaveCount(3);
    await expect(rows.first()).toContainText("Treat 04");
    await expect(rows.last()).toContainText("Treat 02");

    await rows.first().click();
    await expect(page).toHaveURL(/\/owner\/snap\/treat\?check=/);
    await expect(screen.getByTestId("treat-result-safe")).toBeVisible();
  });

  test("no checks yet: the Snap tab shows no Recent checks", async ({ page }) => {
    const screen = await openSnap(page, OWNER);
    await expect(screen.getByTestId("snap-card-treat")).toBeVisible();
    await expect(screen.getByTestId("snap-recent")).toHaveCount(0);
  });
});
