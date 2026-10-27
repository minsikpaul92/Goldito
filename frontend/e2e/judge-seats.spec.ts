import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { app } from "./helpers";
import { OWNER, SITTER, mockSupabase } from "./supabaseMock";

// Judge seats (#411): a judge set is held by one browser at a time. The seat RPCs (015t) and `POST /api/demo/seat`
// are faked here; the DB rules are covered by the SQL smoke (015t) and the route by pytest (test_demo_reset_api).

const PASSWORD = "e2e-demo-password";
const judgeOwner = (n: number) => ({ ...OWNER, id: `00000000-0000-4000-8000-0000000000c${n}`, email: `demo-owner-judge${n}@goldito.test`, password: PASSWORD });
const judgeSitter = (n: number) => ({ ...SITTER, id: `00000000-0000-4000-8000-0000000000d${n}`, email: `demo-sitter-judge${n}@goldito.test`, password: PASSWORD });
const JUDGES = [1, 2, 3, 4].flatMap((n) => [judgeOwner(n), judgeSitter(n)]);

type Seats = Record<string, "free" | "taken" | "mine">;

/** Fakes the seat RPCs and the seat route; returns what the app sent. */
async function fakeSeats(page: Page, seats: Seats, options: { claim?: number; beat?: boolean } = {}) {
  const calls = { claims: [] as Record<string, string>[], releases: [] as Record<string, string>[], beats: 0 };
  await page.route("**/rpc/judge_seat_status", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(
        [1, 2, 3, 4].map((n) => ({ set_key: `judge${n}`, in_use: (seats[`judge${n}`] ?? "free") !== "free", mine: seats[`judge${n}`] === "mine" })),
      ),
    }),
  );
  await page.route("**/rpc/judge_seat_heartbeat", (route) => {
    calls.beats += 1;
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(options.beat ?? true) });
  });
  await page.route("**/rpc/release_judge_seat", (route) => {
    calls.releases.push(route.request().postDataJSON());
    return route.fulfill({ status: 204, body: "" });
  });
  await page.route("**/api/demo/seat", (route) => {
    const body = route.request().postDataJSON();
    calls.claims.push(body);
    const status = options.claim ?? 200;
    return route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(status === 200 ? { set: body.set, fresh: true } : { detail: "Judge 2 is in use." }),
    });
  });
  return calls;
}

async function openJudgeSeats(page: Page) {
  await page.goto("/login");
  const screen = app(page);
  await screen.getByTestId("demo-set").click();
  await screen.getByTestId("demo-set-judges").click();
  await expect(screen.getByTestId("judge-seat")).toBeVisible();
  return screen;
}

test.describe("judge seats", () => {
  test("a held seat shows In use; taking a free one signs in to that judge set", async ({ page }) => {
    await mockSupabase(page, JUDGES);
    const calls = await fakeSeats(page, { judge1: "taken" });
    const screen = await openJudgeSeats(page);

    await expect(screen.getByTestId("judge-seat-judge1")).toContainText("Judge 1 · In use");
    await expect(screen.getByTestId("judge-seat-judge1")).toHaveAttribute("aria-disabled", "true");
    // The first free seat is picked.
    await expect(screen.getByTestId("judge-seat-judge2")).toHaveAttribute("aria-checked", "true");
    await screen.getByTestId("judge-seat-judge3").click();

    await screen.getByTestId("demo-owner").click();
    await expect(page).toHaveURL(/\/owner$/);
    expect(calls.claims).toHaveLength(1);
    expect(calls.claims[0].set).toBe("judge3");
    expect(calls.claims[0].holder).toMatch(/^[0-9a-f-]{36}$/);
    // The seat is kept with a heartbeat.
    await expect.poll(() => calls.beats).toBeGreaterThan(0);
  });

  test("all four seats in use says so", async ({ page }) => {
    await mockSupabase(page, JUDGES);
    await fakeSeats(page, { judge1: "taken", judge2: "taken", judge3: "taken", judge4: "taken" });
    const screen = await openJudgeSeats(page);

    await expect(screen.getByTestId("judge-seats-busy")).toHaveText("All judge seats are busy. Try again in a few minutes.");
    await screen.getByTestId("demo-owner").click();
    await expect(screen.getByTestId("login-error")).toContainText("All judge seats are busy");
    await expect(page).toHaveURL(/\/login/);
  });

  test("a seat another browser took first stays on the login screen and says so", async ({ page }) => {
    await mockSupabase(page, JUDGES);
    await fakeSeats(page, {}, { claim: 409 });
    const screen = await openJudgeSeats(page);

    await screen.getByTestId("demo-sitter").click();
    await expect(screen.getByTestId("login-error")).toHaveText("Judge 2 is in use.");
    await expect(page).toHaveURL(/\/login/);
  });

  test("signing out frees the seat", async ({ page }) => {
    await mockSupabase(page, JUDGES);
    const calls = await fakeSeats(page, {});
    const screen = await openJudgeSeats(page);
    await screen.getByTestId("demo-owner").click();
    await expect(page).toHaveURL(/\/owner$/);

    await screen.getByTestId("open-menu").click();
    await screen.getByTestId("log-out").click();
    await expect(page).toHaveURL(/\/welcome$/);
    expect(calls.releases).toHaveLength(1);
    expect(calls.releases[0].p_set).toBe("judge1");
    expect(calls.releases[0].p_holder).toBe(calls.claims[0].holder);
  });

  test("a seat that went to another judge signs out with a note", async ({ page }) => {
    await mockSupabase(page, JUDGES);
    // Signed in by hand: no heartbeat, and the seat is someone else's.
    await fakeSeats(page, { judge2: "taken" }, { beat: false, claim: 409 });
    await page.goto("/login");
    const screen = app(page);
    await screen.getByTestId("login-email").fill(judgeOwner(2).email);
    await screen.getByTestId("login-password").fill(PASSWORD);
    await screen.getByRole("button", { name: "Log in", exact: true }).click();

    await expect(page).toHaveURL(/\/welcome$/);
  });

  test("team sets still sign in without a seat", async ({ page }) => {
    const chloe = { ...SITTER, email: "demo-sitter@goldito.test", password: PASSWORD };
    await mockSupabase(page, [chloe]);
    const calls = await fakeSeats(page, {});
    await page.goto("/login");
    await expect(app(page).getByTestId("judge-seat")).toHaveCount(0);
    await app(page).getByTestId("demo-sitter").click();
    await expect(page).toHaveURL(/\/sitter$/);
    expect(calls.claims).toHaveLength(0);
    expect(calls.beats).toBe(0);
  });
});

test.describe("judge seats, split view", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("taking a seat in one phone signs the other phone in to the same set", async ({ page }) => {
    await mockSupabase(page, JUDGES);
    await fakeSeats(page, {});
    await page.goto("/?view=split");
    const left = page.frameLocator('iframe[name="pane-left"]');
    await left.getByTestId("demo-set").click();
    await left.getByTestId("demo-set-judges").click();
    await left.getByTestId("judge-seat-judge4").click();
    await left.getByTestId("demo-owner").click();

    await expect(page.getByText("Robert · Owner")).toBeVisible();
    await expect(page.getByText("Chloe · Sitter")).toBeVisible();
    await expect.poll(() => page.frame({ name: "pane-right" })?.url() ?? "").toMatch(/\/sitter$/);
  });
});
