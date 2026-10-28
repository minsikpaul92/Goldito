import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { app } from "./helpers";
import { OWNER, SITTER, mockSupabase } from "./supabaseMock";

// The judge panel (#413): left of the phone on a computer at any window width, only while a phone holds a Judge seat;
// log out takes it away. A scene resets the judge's own set with the seat's holder id, opens the screen on the phone
// and plays itself there (the AI answers are not faked here, so the plays themselves are checked by hand). The
// backend's seat check is covered by pytest (test_demo_reset_api).

test.use({ viewport: { width: 1440, height: 900 } });

const PASSWORD = "e2e-demo-password";
const judgeOwner = { ...OWNER, id: "00000000-0000-4000-8000-0000000000c2", email: "demo-owner-judge2@goldito.test", password: PASSWORD };
const judgeSitter = { ...SITTER, id: "00000000-0000-4000-8000-0000000000d2", email: "demo-sitter-judge2@goldito.test", password: PASSWORD };
const teamSitter = { ...SITTER, email: "demo-sitter@goldito.test", password: PASSWORD };

async function takeJudgeSeat(page: Page) {
  const resets: Record<string, string>[] = [];
  await page.route("**/rpc/judge_seat_status", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([1, 2, 3, 4].map((n) => ({ set_key: `judge${n}`, in_use: n === 1, mine: false }))),
    }),
  );
  await page.route("**/rpc/judge_seat_heartbeat", (route) => route.fulfill({ status: 200, contentType: "application/json", body: "true" }));
  await page.route("**/api/demo/seat", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ set: "judge2", fresh: true }) }),
  );
  await page.route("**/api/demo/reset", (route) => {
    resets.push(route.request().postDataJSON());
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ state: "pets", deleted: {} }) });
  });
  await page.goto("/login");
  const screen = app(page);
  await screen.getByTestId("demo-set").click();
  await screen.getByTestId("demo-set-judges").click();
  await screen.getByTestId("demo-owner").click();
  await expect(page.getByText("Robert · Owner")).toBeVisible();
  return resets;
}

/** A scene opens with a full load of the phone; wait until the app inside is up before the next tap on the panel. */
async function phoneReady(page: Page) {
  await expect(app(page).locator("[data-testid]:visible").first()).toBeVisible();
}

function phoneUrl(page: Page): string {
  return page.frames().find((frame) => frame !== page.mainFrame())?.url() ?? "";
}

test.describe("judge panel", () => {
  test("a team account sees no panel", async ({ page }) => {
    await mockSupabase(page, [teamSitter]);
    await page.goto("/login");
    await app(page).getByTestId("demo-sitter").click();
    await expect(page.getByText("Chloe · Sitter")).toBeVisible();
    await expect(page.getByTestId("judge-panel")).toHaveCount(0);
  });

  test("a judge seat shows the five scenes in story order with their model tags", async ({ page }) => {
    await mockSupabase(page, [judgeOwner, judgeSitter]);
    await takeJudgeSeat(page);
    const panel = page.getByTestId("judge-panel");

    await expect(panel).toBeVisible();
    await expect(page.getByTestId("judge-panel-seat")).toHaveText("Judge 2");
    const titles = ["1. Meet the pet", "2. Treat check", "3. Book in chat", "4. A day of care", "5. Home safe"];
    for (const [i, key] of ["meet", "treat", "chat", "care", "home"].entries()) {
      await expect(page.getByTestId(`judge-scene-${key}`)).toContainText(titles[i]);
    }
    // Tavily (its logo) on scenes 1 and 2 only.
    await expect(page.getByTestId("judge-scene-meet").getByTestId("judge-tag-tavily")).toBeVisible();
    await expect(page.getByTestId("judge-scene-treat").getByTestId("judge-tag-tavily")).toBeVisible();
    await expect(page.getByTestId("judge-scene-treat")).toContainText("Nemotron Ultra");
    for (const key of ["chat", "care", "home"]) await expect(page.getByTestId(`judge-scene-${key}`).getByTestId("judge-tag-tavily")).toHaveCount(0);
    await expect(panel).not.toContainText("NVIDIA MiniCPM");

    // More is folded until opened.
    await expect(page.getByTestId("judge-scene-mood")).toHaveCount(0);
    await page.getByTestId("judge-more").click();
    for (const key of ["mood", "trip", "sticker"]) await expect(page.getByTestId(`judge-scene-${key}`)).toBeVisible();
  });

  test("a scene resets the judge's own set, opens the screen and can be replayed", async ({ page }) => {
    await mockSupabase(page, [judgeOwner, judgeSitter]);
    const resets = await takeJudgeSeat(page);

    // Treat check explains itself first; Play starts it.
    await page.getByTestId("judge-scene-treat").click();
    await expect(page.getByTestId("judge-intro")).toContainText("Max is allergic to chicken.");
    await page.getByTestId("judge-intro-play").click();
    await expect.poll(() => phoneUrl(page)).toMatch(/\/owner\/snap\/treat$/);
    await expect(page.getByTestId("judge-hint")).toHaveText("Max is allergic to chicken. The owner checks a treat, then the sitter.");
    await phoneReady(page);
    expect(resets).toHaveLength(1);
    expect(resets[0].state).toBe("in_care");
    // The reset carries this browser's seat holder id: the backend resets only the seat it holds.
    expect(resets[0].holder).toMatch(/^[0-9a-f-]{36}$/);

    // Reset asks which state: the list of demo states, and the one picked is the one reset to.
    // The scene may still be playing on the phone (the AI is not faked here): stop it first.
    if (await page.getByTestId("judge-stop").isVisible()) await page.getByTestId("judge-stop").click();
    await expect(page.getByTestId("judge-reset")).toBeEnabled();
    await page.getByTestId("judge-reset").click();
    await expect(page.getByTestId("judge-reset-sheet")).toContainText("Ready for drop-off");
    const reloaded = page.waitForEvent("framenavigated", (frame) => frame !== page.mainFrame());
    await page.getByTestId("judge-reset-confirmed").click();
    await expect.poll(() => resets.length).toBe(2);
    expect(resets[1].state).toBe("confirmed");
    await reloaded;
    await phoneReady(page);

    // Mood starts in care, so the sitter can try it too.
    await page.getByTestId("judge-more").click();
    await expect(page.getByTestId("judge-scene-mood")).toBeEnabled();
    await page.getByTestId("judge-scene-mood").click();
    await expect.poll(() => phoneUrl(page)).toMatch(/\/owner\/snap\/mood$/);
    await expect.poll(() => resets.length).toBe(3);
    expect(resets[2].state).toBe("in_care");
  });

  test("the panel stays on a narrow window, and log out takes it away", async ({ page }) => {
    await page.setViewportSize({ width: 1000, height: 900 });
    await mockSupabase(page, [judgeOwner, judgeSitter]);
    await page.route("**/rpc/release_judge_seat", (route) => route.fulfill({ status: 204, body: "" }));
    await takeJudgeSeat(page);
    await expect(page.getByTestId("judge-panel")).toBeVisible();

    await app(page).getByTestId("open-menu").click();
    await app(page).getByTestId("log-out").click();
    await expect(page.getByTestId("judge-panel")).toHaveCount(0);
  });

  test("a scene shows the paw walk on the phone while it resets the stay", async ({ page }) => {
    await mockSupabase(page, [judgeOwner, judgeSitter]);
    await takeJudgeSeat(page);
    // A slow reset, so the paw walk can be seen.
    await page.route("**/api/demo/reset", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1_500));
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ state: "pets", deleted: {} }) });
    });
    await page.getByTestId("judge-scene-treat").click();
    await page.getByTestId("judge-intro-play").click();
    await expect(page.getByTestId("frame-loading")).toBeVisible();
    await expect(page.getByTestId("frame-loading")).toHaveCount(0, { timeout: 15_000 });
  });
});
