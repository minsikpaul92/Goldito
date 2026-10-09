import { expect, test } from "@playwright/test";

import { app, signIn } from "./helpers";
import { OWNER, mockSupabase } from "./supabaseMock";

// Profile → Demo tools (the temporary testing reset): only the two demo accounts see it, it asks before
// it deletes, and it sends the chosen state to the backend. The route itself is covered by pytest.

const DEMO_OWNER = { ...OWNER, email: "demo-owner@goldito.test", password: "e2e-demo-password" };

test.describe("demo tools", () => {
  test("a demo account picks a state, confirms, and the reset request carries it", async ({ page }) => {
    await mockSupabase(page, [DEMO_OWNER]);
    const requests: Record<string, unknown>[] = [];
    await page.route("**/api/demo/reset", (route) => {
      requests.push(route.request().postDataJSON());
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ state: "confirmed", deleted: {} }) });
    });
    await signIn(page, DEMO_OWNER);
    await expect(page).toHaveURL(/\/owner$/);
    const screen = app(page);

    await screen.getByTestId("open-profile").click();
    await expect(screen.getByTestId("demo-tools")).toBeVisible();
    await expect(screen.getByTestId("demo-state-pets")).toHaveAttribute("aria-checked", "true");

    await screen.getByTestId("demo-state-confirmed").click();
    await screen.getByTestId("demo-reset-open").click();
    // It asks first; nothing is sent until the owner confirms.
    await expect(screen.getByTestId("demo-reset-sheet")).toContainText("Booking accepted");
    expect(requests).toHaveLength(0);

    await screen.getByTestId("demo-reset-confirm").click();
    await expect(screen.getByTestId("toast")).toContainText("Demo reset: Booking accepted");
    expect(requests).toEqual([{ state: "confirmed" }]);
    await expect(page).toHaveURL(/\/owner$/);
  });

  test("a failed reset keeps the sheet open and says why", async ({ page }) => {
    await mockSupabase(page, [DEMO_OWNER]);
    await page.route("**/api/demo/reset", (route) => route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ code: "not_found", message: "Not found" }) }));
    await signIn(page, DEMO_OWNER);
    await expect(page).toHaveURL(/\/owner$/);
    const screen = app(page);

    await screen.getByTestId("open-profile").click();
    await screen.getByTestId("demo-reset-open").click();
    await screen.getByTestId("demo-reset-confirm").click();

    await expect(screen.getByTestId("demo-reset-error")).toContainText("DEMO_RESET_ENABLED");
    await expect(screen.getByTestId("demo-reset-sheet")).toBeVisible();
  });

  test("an ordinary account does not see the tools", async ({ page }) => {
    await mockSupabase(page, [OWNER]);
    await signIn(page, OWNER);
    await expect(page).toHaveURL(/\/owner$/);
    const screen = app(page);

    await screen.getByTestId("open-profile").click();
    await expect(screen.getByTestId("profile-save")).toBeVisible();
    await expect(screen.getByTestId("demo-tools")).toHaveCount(0);
  });
});
