import { expect, test, type Page } from "@playwright/test";

import { app } from "./helpers";
import { OWNER, SITTER, mockSupabase, type MockUser } from "./supabaseMock";

// Sign in, sign up, and role routing inside the desktop phone frame (phase-03 3.1–3.3).

async function signIn(page: Page, user: MockUser) {
  await page.goto("/login");
  await app(page).getByTestId("login-email").fill(user.email);
  await app(page).getByTestId("login-password").fill(user.password);
  await app(page).getByRole("button", { name: "Sign in" }).click();
}

test.describe("auth and role routing", () => {
  test("signed-out visitors land on sign in", async ({ page }) => {
    await mockSupabase(page, [OWNER, SITTER]);
    await page.goto("/");
    await expect(page).toHaveURL(/\/login$/);
    await expect(app(page).getByRole("button", { name: "Sign in" })).toBeVisible();

    await page.goto("/owner/feed");
    await expect(page).toHaveURL(/\/login$/);
  });

  test("a wrong password shows a human message", async ({ page }) => {
    await mockSupabase(page, [OWNER]);
    await signIn(page, { ...OWNER, password: "not-it" });
    await expect(app(page).getByTestId("login-error")).toHaveText("Wrong email or password.");
    await expect(page).toHaveURL(/\/login$/);
  });

  test("an owner gets the owner tabs and keeps the session after a reload", async ({ page }) => {
    await mockSupabase(page, [OWNER, SITTER]);
    await signIn(page, OWNER);
    await expect(page).toHaveURL(/\/owner$/);
    for (const tab of ["Feed", "Care", "Reports"]) {
      await expect(app(page).getByText(tab, { exact: true }).first()).toBeVisible();
    }
    await expect(app(page).getByText("No pets yet")).toBeVisible();

    await page.reload();
    await expect(page).toHaveURL(/\/owner$/);
    await expect(app(page).getByText("No pets yet")).toBeVisible();
  });

  test("a sitter gets the sitter tabs and cannot open the owner area", async ({ page }) => {
    await mockSupabase(page, [OWNER, SITTER]);
    await signIn(page, SITTER);
    await expect(page).toHaveURL(/\/sitter$/);
    for (const tab of ["Tasks", "Scan", "Report"]) {
      await expect(app(page).getByText(tab, { exact: true }).first()).toBeVisible();
    }

    await page.goto("/owner/tasks");
    await expect(page).toHaveURL(/\/sitter$/);
    await expect(app(page).getByText("No bookings yet")).toBeVisible();
  });

  test("tabs switch with a mouse click", async ({ page }) => {
    await mockSupabase(page, [SITTER]);
    await signIn(page, SITTER);
    await expect(page).toHaveURL(/\/sitter$/);
    await app(page).getByText("Scan", { exact: true }).last().click();
    await expect(page).toHaveURL(/\/sitter\/scan$/);
    await expect(app(page).getByText("Treat scanner")).toBeVisible();
  });

  test("signing up as a sitter sends the role and opens the sitter area", async ({ page }) => {
    const { signups } = await mockSupabase(page, []);
    await page.goto("/signup");
    const signup = app(page);
    await signup.getByTestId("role-sitter").click();
    await signup.getByTestId("signup-name").fill("Mina");
    await signup.getByTestId("signup-email").fill("mina@pawnote.test");
    await signup.getByTestId("signup-password").fill("care-snap-tap");
    await signup.getByRole("button", { name: "Create account" }).click();

    await expect(page).toHaveURL(/\/sitter$/);
    expect(signups).toEqual([{ email: "mina@pawnote.test", role: "sitter", display_name: "Mina" }]);
  });

  test("log out returns to sign in", async ({ page }) => {
    await mockSupabase(page, [OWNER]);
    await signIn(page, OWNER);
    await expect(page).toHaveURL(/\/owner$/);
    await app(page).getByTestId("log-out").click();
    await expect(page).toHaveURL(/\/login$/);

    await page.goto("/owner");
    await expect(page).toHaveURL(/\/login$/);
  });
});
