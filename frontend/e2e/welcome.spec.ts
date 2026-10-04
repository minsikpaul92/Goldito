import { expect, test } from "@playwright/test";

import { app, signIn } from "./helpers";
import { OWNER, SITTER, mockSupabase } from "./supabaseMock";

// Welcome / role onboarding (OB.1–OB.2): landing → role tour → existing login.

test.describe("welcome", () => {
  test("landing offers owner and sitter tours, then Sign in opens login", async ({ page }) => {
    await mockSupabase(page, [OWNER, SITTER]);
    await page.goto("/");
    await expect(page).toHaveURL(/\/welcome$/);
    const screen = app(page);

    await expect(screen.getByTestId("welcome")).toBeVisible();
    await expect(screen.getByTestId("welcome-choose-owner")).toContainText("Pet owner");
    await expect(screen.getByTestId("welcome-choose-sitter")).toContainText("Pet sitter");

    await screen.getByTestId("welcome-sign-in").click();
    await expect(page).toHaveURL(/\/login$/);
    await expect(screen.getByRole("button", { name: "Sign in" })).toBeVisible();
    await expect(screen.getByTestId("login-email")).toBeVisible();
  });

  test("owner tour steps through placeholders and Sign in", async ({ page }) => {
    await mockSupabase(page, [OWNER, SITTER]);
    await page.goto("/welcome");
    const screen = app(page);

    await screen.getByTestId("welcome-choose-owner").click();
    await expect(page).toHaveURL(/\/welcome\/owner$/);
    await expect(screen.getByTestId("onboarding-owner-title")).toContainText("already know you");
    await expect(screen.getByTestId("onboarding-owner-media-0")).toContainText("Photo placeholder");

    await screen.getByTestId("onboarding-owner-next").click();
    await expect(screen.getByTestId("onboarding-owner-progress")).toHaveText("2 / 3");
    await screen.getByTestId("onboarding-owner-next").click();
    await screen.getByTestId("onboarding-owner-sign-in").click();
    await expect(page).toHaveURL(/\/login$/);
  });

  test("sitter tour Try demo lands on Today", async ({ page }) => {
    const demoSitter = { ...SITTER, email: "demo-sitter@pawnote.test", password: "e2e-demo-password" };
    await mockSupabase(page, [OWNER, demoSitter]);
    await page.goto("/welcome/sitter");
    const screen = app(page);

    await screen.getByTestId("onboarding-sitter-next").click();
    await screen.getByTestId("onboarding-sitter-next").click();
    await screen.getByTestId("onboarding-sitter-demo").click();
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

  test("login Back returns to Welcome", async ({ page }) => {
    await mockSupabase(page, [OWNER, SITTER]);
    await page.goto("/login");
    const screen = app(page);
    await screen.getByTestId("login-back").click();
    await expect(page).toHaveURL(/\/welcome$/);
    await expect(screen.getByTestId("welcome-choose-owner")).toBeVisible();
  });
});
