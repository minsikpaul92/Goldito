import { expect, test } from "@playwright/test";

import { app, signIn } from "./helpers";
import { OWNER, SITTER, mockSupabase } from "./supabaseMock";

// Demo sets: an owner and a sitter per teammate, picked on the login screen, and a reset that carries the set's own
// account. The backend only resets the caller's pair (covered by pytest).

const PASSWORD = "e2e-demo-password";
const chloeSitter = { ...SITTER, email: "demo-sitter@goldito.test", password: PASSWORD };
const paulOwner = { ...OWNER, id: "00000000-0000-4000-8000-0000000000a9", email: "demo-owner-paul@goldito.test", displayName: "Paul", password: PASSWORD };
const paulSitter = { ...SITTER, id: "00000000-0000-4000-8000-0000000000b9", email: "demo-sitter-paul@goldito.test", displayName: "Paul", password: PASSWORD };

test.describe("demo sets", () => {
  test("the login screen picks whose demo accounts the two buttons sign in to", async ({ page }) => {
    await mockSupabase(page, [chloeSitter, paulOwner, paulSitter]);
    await page.goto("/login");
    const screen = app(page);

    // The default set is Chloe's (the judges' pair).
    await expect(screen.getByTestId("demo-set")).toContainText("Chloe");
    await screen.getByTestId("demo-set").click();
    for (const key of ["chloe", "paul", "allen"]) await expect(screen.getByTestId(`demo-set-${key}`)).toBeVisible();
    await screen.getByTestId("demo-set-paul").click();
    await expect(screen.getByTestId("demo-set")).toContainText("Paul");

    await screen.getByTestId("demo-sitter").click();
    await expect(page).toHaveURL(/\/sitter$/);
    await expect(page.getByText("Paul · Sitter")).toBeVisible();
  });

  test("the default button still signs in to the default pair", async ({ page }) => {
    await mockSupabase(page, [chloeSitter]);
    await page.goto("/login");
    await app(page).getByTestId("demo-sitter").click();
    await expect(page).toHaveURL(/\/sitter$/);
    await expect(page.getByText("Chloe · Sitter")).toBeVisible();
  });

  test("a set's account sees its own set in the demo tools", async ({ page }) => {
    await mockSupabase(page, [paulOwner]);
    await page.route("**/api/demo/reset", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ state: "pets", deleted: {} }) }),
    );
    await signIn(page, paulOwner);
    await expect(page).toHaveURL(/\/owner$/);
    const screen = app(page);

    await screen.getByTestId("open-profile").click();
    await expect(screen.getByTestId("demo-tools")).toContainText("Demo tools (Paul)");
    await screen.getByTestId("demo-reset-open").click();
    await expect(screen.getByTestId("demo-reset-sheet")).toContainText("Paul set");
  });
});
