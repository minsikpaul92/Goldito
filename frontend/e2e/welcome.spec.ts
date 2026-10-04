import { expect, test } from "@playwright/test";

import { app, signIn } from "./helpers";
import { OWNER, SITTER, mockSupabase } from "./supabaseMock";

// Welcome / Intro (onboarding OB.1–OB.2): `/` → welcome, CTAs into login demo.

test.describe("welcome", () => {
  test("shows three steps and opens Sign in", async ({ page }) => {
    await mockSupabase(page, [OWNER, SITTER]);
    await page.goto("/");
    await expect(page).toHaveURL(/\/welcome$/);
    const screen = app(page);

    await expect(screen.getByTestId("welcome-step-1")).toContainText("Peace of mind for owners");
    await expect(screen.getByTestId("welcome-step-2")).toContainText("Learn without asking");
    await expect(screen.getByTestId("welcome-step-3")).toContainText("A stay with PawNote");

    await screen.getByTestId("welcome-sign-in").click();
    await expect(page).toHaveURL(/\/login$/);
    await expect(screen.getByRole("button", { name: "Sign in" })).toBeVisible();
  });

  test("Try demo as Sitter goes through login demo and lands on Today", async ({ page }) => {
    const demoSitter = { ...SITTER, email: "demo-sitter@pawnote.test", password: "e2e-demo-password" };
    await mockSupabase(page, [OWNER, demoSitter]);
    await page.goto("/welcome");
    const screen = app(page);

    await screen.getByTestId("welcome-demo-sitter").click();
    // login?demo=sitter auto-signs in (OB.3) — may skip the login URL before Playwright sees it.
    await expect(page).toHaveURL(/\/sitter$/);
    await expect(screen.getByText("No bookings yet")).toBeVisible();
  });

  test("signed-in users skip Welcome", async ({ page }) => {
    await mockSupabase(page, [OWNER]);
    await signIn(page, OWNER);
    await expect(page).toHaveURL(/\/owner$/);
    await page.goto("/welcome");
    await expect(page).toHaveURL(/\/owner$/);
  });
});
