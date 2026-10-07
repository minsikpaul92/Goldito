import { Page, expect, test } from "@playwright/test";

import { app, signIn } from "./helpers";
import { OWNER, SITTER, mockSupabase } from "./supabaseMock";

// Sign in, sign up, and role routing inside the desktop phone frame (phase-03 3.1–3.3).

// Bottom tabs per role (phase-03b 3B.0, architecture §3).
const OWNER_TABS = ["Home", "Bookings", "Feed", "Diary", "Mood"];
const SITTER_TABS = ["Home", "Bookings", "Feed", "Diary", "Mood"];

/** Exactly these tabs, in order, and no label cut off in height or width. */
async function expectTabs(page: Page, labels: string[]) {
  const tabs = app(page).getByRole("tab");
  await expect(tabs).toHaveCount(labels.length);
  for (const [i, name] of labels.entries()) {
    const label = tabs.nth(i).getByText(name, { exact: true });
    await expect(label).toBeVisible();
    // The library default bar height cut labels off on web; five tabs must also fit 402 px.
    const clipped = await label.evaluate(
      (el) => el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1,
    );
    expect(clipped, `${name} tab label is clipped`).toBe(false);
  }
}

test.describe("auth and role routing", () => {
  test("signed-out visitors land on Welcome", async ({ page }) => {
    await mockSupabase(page, [OWNER, SITTER]);
    await page.goto("/");
    await expect(page).toHaveURL(/\/welcome$/);
    await expect(app(page).getByTestId("welcome")).toBeVisible();
    await expect(app(page).getByTestId("welcome-sign-in")).toBeVisible();

    // Deep links into a role area still gate to Welcome when signed out (OB.1).
    await page.goto("/owner/feed");
    await expect(page).toHaveURL(/\/welcome$/);
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
    await expectTabs(page, OWNER_TABS);
    await expect(app(page).getByText("No pets yet")).toBeVisible();

    await page.reload();
    await expect(page).toHaveURL(/\/owner$/);
    await expect(app(page).getByText("No pets yet")).toBeVisible();
  });

  test("a sitter gets the sitter tabs and cannot open the owner area", async ({ page }) => {
    await mockSupabase(page, [OWNER, SITTER]);
    await signIn(page, SITTER);
    await expect(page).toHaveURL(/\/sitter$/);
    await expectTabs(page, SITTER_TABS);
    // The treat scanner opens from a Home button (Phase 08), not a tab.
    await expect(app(page).getByRole("tab").getByText("Scan", { exact: true })).toHaveCount(0);

    await page.goto("/owner/diary");
    await expect(page).toHaveURL(/\/sitter$/);
    await expect(app(page).getByText("No bookings yet")).toBeVisible();
  });

  test("tabs switch with a mouse click", async ({ page }) => {
    await mockSupabase(page, [SITTER]);
    await signIn(page, SITTER);
    await expect(page).toHaveURL(/\/sitter$/);
    await app(page).getByRole("tab").getByText("Bookings", { exact: true }).click();
    await expect(page).toHaveURL(/\/sitter\/bookings$/);
    await expect(app(page).getByText("No requests yet")).toBeVisible();
  });

  test("an owner opens the Bookings tab with a mouse click", async ({ page }) => {
    await mockSupabase(page, [OWNER]);
    await signIn(page, OWNER);
    await expect(page).toHaveURL(/\/owner$/);
    await app(page).getByRole("tab").getByText("Bookings", { exact: true }).click();
    await expect(page).toHaveURL(/\/owner\/bookings$/);
    await expect(app(page).getByText("No bookings yet")).toBeVisible();
  });

  test("signing up as a sitter sends the role and opens the sitter area", async ({ page }) => {
    const { signups } = await mockSupabase(page, []);
    await page.goto("/signup");
    const signup = app(page);
    await signup.getByTestId("role-sitter").click();
    await expect(signup.getByTestId("role-sitter")).toHaveAttribute("aria-checked", "true");
    await expect(signup.getByTestId("role-owner")).toHaveAttribute("aria-checked", "false");
    await signup.getByTestId("signup-name").fill("Chloe");
    await signup.getByTestId("signup-email").fill("chloe@pawddy.test");
    await signup.getByTestId("signup-password").fill("care-snap-tap");
    await signup.getByTestId("signup-confirm").fill("care-snap-tap");
    await signup.getByRole("button", { name: "Create account" }).click();

    await expect(page).toHaveURL(/\/sitter$/);
    expect(signups).toEqual([{ email: "chloe@pawddy.test", role: "sitter", display_name: "Chloe" }]);
  });

  test("sign up checks the email shape and that both passwords match, and Back returns", async ({ page }) => {
    const { signups } = await mockSupabase(page, []);
    await page.goto("/login");
    const screen = app(page);
    await screen.getByTestId("go-signup").click();
    await expect(page).toHaveURL(/\/signup$/);

    await screen.getByTestId("role-owner").click();
    await screen.getByTestId("signup-name").fill("Robert");
    await screen.getByTestId("signup-email").fill("robert@goldito");
    await screen.getByTestId("signup-password").fill("max-and-mochi");
    await screen.getByTestId("signup-confirm").fill("max-and-moch");
    await expect(screen.getByText("Passwords don't match.")).toBeVisible();
    await expect(screen.getByRole("button", { name: "Create account" })).toBeDisabled();

    await screen.getByTestId("signup-confirm").fill("max-and-mochi");
    await expect(screen.getByText("Passwords don't match.")).toHaveCount(0);
    await screen.getByRole("button", { name: "Create account" }).click();
    await expect(screen.getByTestId("signup-error")).toHaveText("Enter a valid email address, like you@example.com.");
    expect(signups).toHaveLength(0);

    await screen.getByTestId("signup-back").click();
    await expect(page).toHaveURL(/\/login$/);
    // A direct link has nothing to go back to → Welcome (OB.1).
    await page.goto("/signup");
    await screen.getByTestId("signup-back").click();
    await expect(page).toHaveURL(/\/welcome$/);
  });

  test("Try demo buttons sign in to the seeded owner and sitter (OB.3)", async ({ page }) => {
    // Same strings as lib/demo.ts; the password is the CI build's test-only EXPO_PUBLIC_DEMO_PASSWORD.
    const demoOwner = { ...OWNER, email: "demo-owner@pawddy.test", password: "e2e-demo-password" };
    const demoSitter = { ...SITTER, email: "demo-sitter@pawddy.test", password: "e2e-demo-password" };
    await mockSupabase(page, [demoOwner, demoSitter]);

    await page.goto("/login");
    const screen = app(page);
    await expect(screen.getByTestId("demo-block")).toContainText("or try a demo");
    await screen.getByTestId("demo-owner").click();
    await expect(page).toHaveURL(/\/owner$/);

    await screen.getByTestId("log-out").click();
    await expect(page).toHaveURL(/\/welcome$/);
    await page.goto("/login");
    await screen.getByTestId("demo-sitter").click();
    await expect(page).toHaveURL(/\/sitter$/);

    // The query does the same (desktop side panel, split view).
    await screen.getByTestId("log-out").click();
    await expect(page).toHaveURL(/\/welcome$/);
    await page.goto("/login?demo=owner");
    await expect(page).toHaveURL(/\/owner$/);
  });

  test("log out returns to Welcome", async ({ page }) => {
    await mockSupabase(page, [OWNER]);
    await signIn(page, OWNER);
    await expect(page).toHaveURL(/\/owner$/);
    await app(page).getByTestId("log-out").click();
    await expect(page).toHaveURL(/\/welcome$/);

    await page.goto("/owner");
    await expect(page).toHaveURL(/\/welcome$/);
  });
});
