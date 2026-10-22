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

  test("owner tour steps through placeholders and Get started", async ({ page }) => {
    await mockSupabase(page, [OWNER, SITTER]);
    await page.goto("/welcome");
    const screen = app(page);

    await screen.getByTestId("welcome-choose-owner").click();
    await expect(page).toHaveURL(/\/welcome\/owner$/);
    await expect(screen.getByTestId("onboarding-owner-brand")).toBeVisible();
    await expect(screen.getByTestId("onboarding-owner-title")).toContainText("already know you");
    await expect(screen.getByTestId("onboarding-owner-media-0")).toContainText("Photo placeholder");

    await screen.getByTestId("onboarding-owner-next").click();
    await expect(screen.getByTestId("onboarding-owner-progress")).toHaveText("2 / 3");
    await screen.getByTestId("onboarding-owner-next").click();
    await expect(screen.getByTestId("onboarding-owner-demo")).toHaveCount(0);
    await expect(screen.getByTestId("onboarding-owner-sign-up")).toHaveCount(0);
    await expect(screen.getByTestId("onboarding-owner-sign-in")).toHaveText("Get started");
    await screen.getByTestId("onboarding-owner-sign-in").click();
    await expect(page).toHaveURL(/\/login$/);
  });

  test("sitter tour ends on sign-in with one button, and the demo starts from there", async ({ page }) => {
    const demoSitter = { ...SITTER, email: "demo-sitter@goldito.test", password: "e2e-demo-password" };
    await mockSupabase(page, [OWNER, demoSitter]);
    await page.goto("/welcome/sitter");
    const screen = app(page);
    await expect(screen.getByTestId("onboarding-sitter-brand")).toBeVisible();

    await screen.getByTestId("onboarding-sitter-next").click();
    await screen.getByTestId("onboarding-sitter-next").click();
    await expect(screen.getByTestId("onboarding-sitter-demo")).toHaveCount(0);
    await expect(screen.getByTestId("onboarding-sitter-sign-up")).toHaveCount(0);
    await screen.getByTestId("onboarding-sitter-sign-in").click();
    await expect(page).toHaveURL(/\/login$/);
    await screen.getByTestId("demo-sitter").click();
    await expect(page).toHaveURL(/\/sitter$/);
    await expect(screen.getByText("No pets in your care today")).toBeVisible();
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
