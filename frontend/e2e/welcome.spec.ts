import { expect, test } from "@playwright/test";

import { app, signIn } from "./helpers";
import { OWNER, SITTER, mockSupabase } from "./supabaseMock";

// Welcome (OB.1–OB.3, intro trial on the design site): Try the demo first, then email sign-up and Log in;
// How it works is three short pages that end on the demo and Create account.

test.describe("welcome", () => {
  test("landing leads with Try the demo, then Sign up and Log in", async ({ page }) => {
    await mockSupabase(page, [OWNER, SITTER]);
    await page.goto("/");
    await expect(page).toHaveURL(/\/welcome$/);
    const screen = app(page);

    await expect(screen.getByTestId("welcome")).toBeVisible();
    await expect(screen.getByTestId("welcome-brand")).toBeVisible();
    await expect(screen.getByText("Leave your pet. Keep your peace of mind.")).toBeVisible();
    await expect(screen.getByTestId("welcome-demo")).toHaveText("Try the demo");
    // Apple and Google stay hidden until they work.
    await expect(screen.getByTestId("welcome-social-apple")).toHaveCount(0);

    await screen.getByTestId("welcome-sign-up").click();
    await expect(page).toHaveURL(/\/signup$/);
    await page.goBack();
    await screen.getByTestId("welcome-sign-in").click();
    await expect(page).toHaveURL(/\/login$/);
    await expect(screen.getByRole("button", { name: "Log in", exact: true })).toBeVisible();
    await expect(screen.getByTestId("login-email")).toBeVisible();
  });

  test("Try the demo picks who to be and signs in to that demo account", async ({ page }) => {
    const demoOwner = { ...OWNER, email: "demo-owner@goldito.test", password: "e2e-demo-password" };
    await mockSupabase(page, [demoOwner, SITTER]);
    await page.goto("/welcome");
    const screen = app(page);

    await screen.getByTestId("welcome-demo").click();
    await expect(screen.getByTestId("demo-sheet")).toContainText("Robert, the owner");
    await expect(screen.getByTestId("demo-sheet")).toContainText("Chloe, the sitter");
    await screen.getByTestId("demo-sheet-owner").click();
    await expect(page).toHaveURL(/\/owner$/);
  });

  test("How it works steps through three pages and ends on the demo and Create account", async ({ page }) => {
    await mockSupabase(page, [OWNER, SITTER]);
    await page.goto("/welcome");
    const screen = app(page);

    await screen.getByTestId("welcome-how").click();
    await expect(page).toHaveURL(/\/welcome\/how$/);
    await expect(screen.getByTestId("how-title")).toHaveText("No more “how's Max?”");
    await screen.getByTestId("how-next").click();
    await expect(screen.getByTestId("how-title")).toHaveText("Two sides, one app");
    await screen.getByTestId("how-back").click();
    await expect(screen.getByTestId("how-title")).toHaveText("No more “how's Max?”");
    await screen.getByTestId("how-skip").click();
    await expect(screen.getByTestId("how-title")).toHaveText("A stay with Goldito");
    await expect(screen.getByTestId("how-next")).toHaveCount(0);
    await expect(screen.getByTestId("how-demo")).toBeVisible();
    await screen.getByTestId("how-create").click();
    await expect(page).toHaveURL(/\/signup$/);
  });

  test("the old role tour links open How it works", async ({ page }) => {
    await mockSupabase(page, [OWNER, SITTER]);
    await page.goto("/welcome/sitter");
    await expect(page).toHaveURL(/\/welcome\/how$/);
    await page.goto("/welcome/owner");
    await expect(page).toHaveURL(/\/welcome\/how$/);
  });

  test("login offers the demo with a hint, and the sitter demo starts from there", async ({ page }) => {
    const demoSitter = { ...SITTER, email: "demo-sitter@goldito.test", password: "e2e-demo-password" };
    await mockSupabase(page, [OWNER, demoSitter]);
    await page.goto("/login");
    const screen = app(page);
    await expect(screen.getByTestId("demo-hint")).toHaveText("Demo accounts: Robert with Max and Mochi, booked with Chloe.");
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
    await expect(screen.getByTestId("welcome-demo")).toBeVisible();
  });
});
