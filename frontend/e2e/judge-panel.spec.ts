import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { app } from "./helpers";
import { OWNER, SITTER, mockSupabase } from "./supabaseMock";

// The judge panel (#413): left of the phone on a wide computer window, only while a phone holds a Judge seat (this is
// the team build; the judging build shows it always). A scene resets the judge's own set with the seat's holder id
// and opens the screen on the phone. The backend's seat check is covered by pytest (test_demo_reset_api).

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
    // Tavily on scenes 1 and 2 only.
    await expect(page.getByTestId("judge-scene-meet")).toContainText("Tavily");
    await expect(page.getByTestId("judge-scene-treat")).toContainText("Tavily");
    await expect(page.getByTestId("judge-scene-treat")).toContainText("Nemotron Ultra");
    for (const key of ["chat", "care", "home"]) await expect(page.getByTestId(`judge-scene-${key}`)).not.toContainText("Tavily");
    await expect(panel).not.toContainText("NVIDIA MiniCPM");

    // More is folded until opened.
    await expect(page.getByTestId("judge-scene-mood")).toHaveCount(0);
    await page.getByTestId("judge-more").click();
    for (const key of ["mood", "trip", "sticker"]) await expect(page.getByTestId(`judge-scene-${key}`)).toBeVisible();
  });

  test("a scene resets the judge's own set, opens the screen and can be replayed", async ({ page }) => {
    await mockSupabase(page, [judgeOwner, judgeSitter]);
    const resets = await takeJudgeSeat(page);

    await page.getByTestId("judge-scene-treat").click();
    await expect.poll(() => phoneUrl(page)).toMatch(/\/owner\/snap\/treat$/);
    await expect(page.getByTestId("judge-hint")).toHaveText("Pick the chicken jerky label for Max.");
    await phoneReady(page);
    expect(resets).toHaveLength(1);
    expect(resets[0].state).toBe("pets");
    // The reset carries this browser's seat holder id: the backend resets only the seat it holds.
    expect(resets[0].holder).toMatch(/^[0-9a-f-]{36}$/);

    // The panel is off while the phone reloads into the scene (no account for a moment), so wait for it to come back.
    await expect(page.getByTestId("judge-replay")).toBeEnabled();
    const reloaded = page.waitForEvent("framenavigated", (frame) => frame !== page.mainFrame());
    await page.getByTestId("judge-replay").click();
    await expect.poll(() => resets.length).toBe(2);
    await reloaded;
    // The scene is open again once the hint is back (it reads "Getting it ready…" while the phone reloads).
    await expect(page.getByTestId("judge-hint")).toHaveText("Pick the chicken jerky label for Max.");
    await phoneReady(page);

    // Mood keeps the stay: no reset.
    await page.getByTestId("judge-more").click();
    await expect(page.getByTestId("judge-scene-mood")).toBeEnabled();
    await page.getByTestId("judge-scene-mood").click();
    await expect.poll(() => phoneUrl(page)).toMatch(/\/owner\/snap\/mood$/);
    expect(resets).toHaveLength(2);
  });

  test("the Map finds a feature by search; a scene card runs its scene, the others only open the screen", async ({ page }) => {
    await mockSupabase(page, [judgeOwner, judgeSitter]);
    const resets = await takeJudgeSeat(page);

    await page.getByTestId("judge-tabs").getByText("Map").click();
    await expect(page.getByTestId("judge-map")).toBeVisible();
    await page.getByTestId("judge-map-search").fill("treat");
    await expect(page.getByTestId("judge-map-treat")).toBeVisible();
    await expect(page.getByTestId("judge-map-moments")).toHaveCount(0);

    // Treat check is a scene: it resets the set and opens the screen.
    await page.getByTestId("judge-map-treat").click();
    await expect.poll(() => phoneUrl(page)).toMatch(/\/owner\/snap\/treat$/);
    await phoneReady(page);
    expect(resets).toHaveLength(1);

    // Bookings is not a scene: it opens the screen as the stay is now, with no reset.
    await page.getByTestId("judge-map-search").fill("bookings");
    await expect(page.getByTestId("judge-map-bookings")).toBeEnabled();
    await page.getByTestId("judge-map-bookings").click();
    await expect.poll(() => phoneUrl(page)).toMatch(/\/owner\/bookings$/);
    expect(resets).toHaveLength(1);

    // Nothing found says what to try.
    await page.getByTestId("judge-map-search").fill("zzz");
    await expect(page.getByTestId("judge-map-empty")).toBeVisible();
  });

  test("the panel hides on a narrow window", async ({ page }) => {
    await page.setViewportSize({ width: 1000, height: 900 });
    await mockSupabase(page, [judgeOwner, judgeSitter]);
    await takeJudgeSeat(page);
    await expect(page.getByTestId("judge-panel")).toHaveCount(0);
  });
});
