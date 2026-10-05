import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { caring } from "./careFixtures";
import { app, signIn } from "./helpers";
import { OWNER, SITTER, mockSupabase } from "./supabaseMock";

// Care checklist / care request (phase-06 6.13, redesigned 6.20): chips, one line at a time, a table,
// autosave before a stay, and request → sitter approves or declines while a stay is on.

const MAX = "00000000-0000-4000-8000-0000000000aa";
const MOCHI = "00000000-0000-4000-8000-0000000000bb";

const NO_AI = { tasks: [], cautions: [], skipped: [], model: "m", latency_ms: 1 };

type Plan = typeof NO_AI | { tasks: object[]; cautions: string[]; skipped: object[]; model: string; latency_ms: number } | { status: number; detail: string };

async function setup(page: Page, opts: { petId?: string; plan?: Plan; stay?: boolean } = {}) {
  const { db } = await mockSupabase(page, [OWNER, SITTER]);
  if (opts.stay) {
    caring(db, [
      { id: MAX, name: "Max", species: "dog" },
      { id: MOCHI, name: "Mochi", species: "cat" },
    ]);
  } else {
    db.pets.push(
      { id: MAX, owner_id: OWNER.id, species: "dog", name: "Max", breed: null, birthdate: null, weight_kg: null, notes: null, created_at: "2026-10-01T09:00:00Z" },
      { id: MOCHI, owner_id: OWNER.id, species: "cat", name: "Mochi", breed: null, birthdate: null, weight_kg: null, notes: null, created_at: "2026-10-01T09:05:00Z" },
    );
  }
  const calls: { pet_id: string; text: string }[] = [];
  let current: Plan = opts.plan ?? NO_AI;
  await page.route("**/api/ai/care-plan", (route) => {
    calls.push(route.request().postDataJSON());
    if ("status" in current) {
      return route.fulfill({ status: current.status, contentType: "application/json", body: JSON.stringify({ detail: current.detail }) });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(current) });
  });
  await signIn(page, OWNER);
  await app(page).getByRole("heading", { name: "Home" }).waitFor();
  await page.goto(`/owner/pets/${opts.petId ?? MAX}`);
  await app(page).getByTestId("care-tasks").waitFor();
  return { db, calls, setPlan: (next: Plan) => (current = next) };
}

type Screen = ReturnType<typeof app>;

/** Pick the wheel time by tapping: AM/PM, hour, minute, Set. */
async function pickTime(screen: Screen, ampm: "am" | "pm", hour: number, minute: string) {
  await screen.getByTestId("line-time").click();
  await screen.getByTestId(`time-ampm-${ampm}`).click();
  await screen.getByTestId(`time-hour-${hour}`).click();
  await screen.getByTestId(`time-min-${minute}`).click();
  await screen.getByTestId("time-picker-set").click();
}

async function openBuilder(page: Page) {
  const screen = app(page);
  await screen.getByTestId("care-request-open").click();
  await screen.getByTestId("line-builder").waitFor();
  return screen;
}

test.describe("care checklist (no stay)", () => {
  test("chips: a dog gets Meals · Medication · Walk · Heads-up, a cat has no Walk; a chip fills a preset", async ({ page }) => {
    await setup(page);
    const screen = await openBuilder(page);
    await expect(screen.getByTestId("care-request-heading")).toHaveText("Write a care checklist");
    for (const k of ["meal", "medication", "walk", "headsup"]) await expect(screen.getByTestId(`line-kind-${k}`)).toBeVisible();
    await screen.getByTestId("line-kind-meal").click();
    await expect(screen.getByTestId("line-text")).toHaveValue("");
    await expect(screen.getByTestId("line-text")).toHaveAttribute("placeholder", "1 cup of kibble"); // a hint, not text
    await screen.getByTestId("line-kind-medication").click();
    await expect(screen.getByTestId("line-text")).toHaveAttribute("placeholder", "1 pill, hidden in a lickable treat");

    await page.goto(`/owner/pets/${MOCHI}`);
    await app(page).getByTestId("care-tasks").waitFor();
    await app(page).getByTestId("care-request-open").click();
    await expect(app(page).getByTestId("line-kind-meal")).toBeVisible();
    await expect(app(page).getByTestId("line-kind-walk")).toHaveCount(0);
    await app(page).getByTestId("line-kind-meal").click();
    await expect(app(page).getByTestId("line-text")).toHaveAttribute("placeholder", "Half a can of wet food");
  });

  test("lines → table: a time, several times a day, a Heads-up; everything is saved by itself", async ({ page }) => {
    const { db } = await setup(page);
    const screen = await openBuilder(page);

    // Line 1: a meal at 7:30 AM (the wheel), with the preset text edited.
    await screen.getByTestId("line-kind-meal").click();
    await screen.getByTestId("line-text").fill("1 cup of kibble with a spoon of pumpkin");
    await pickTime(screen, "am", 7, "30");
    await screen.getByTestId("line-add").click();
    await expect(screen.getByTestId("lines")).toContainText("Meals · 7:30 AM every day · 1 cup of kibble with a spoon of pumpkin");
    // A fresh row of chips is ready for the next line, and the editor is closed.
    await expect(screen.getByTestId("line-editor")).toHaveCount(0);

    // Line 2: medication three times a day.
    await screen.getByTestId("line-kind-medication").click();
    await screen.getByTestId("line-mode-count").click();
    await screen.getByTestId("line-count-plus").click(); // 2 → 3
    await screen.getByTestId("line-add").click();
    await expect(screen.getByTestId("lines")).toContainText("Medication · 3 times a day · 1 pill, hidden in a lickable treat"); // empty box = the hint

    // Line 3: a Heads-up (text only).
    await screen.getByTestId("line-kind-headsup").click();
    await expect(screen.getByTestId("line-time")).toHaveCount(0);
    await screen.getByTestId("line-text").fill("No knocking — text me instead");
    await screen.getByTestId("line-add").click();

    await screen.getByTestId("care-request-make").click();
    await expect(screen.getByTestId("checklist-table")).toBeVisible();
    await expect(screen.locator("[data-testid^='draft-time-']")).toHaveCount(4); // 1 meal + 3 pills
    await expect(screen.getByTestId("caution-0")).toContainText("No knocking");
    await expect(screen.getByTestId("save-state")).toHaveText("✓ All changes saved");

    expect(db.care_tasks.map((t) => [t.title, t.scheduled_time, t.type]).sort()).toEqual(
      [
        ["Meal", "07:30", "feeding"],
        ["Medication 1/3", "08:00", "medication"],
        ["Medication 2/3", "14:00", "medication"],
        ["Medication 3/3", "20:00", "medication"],
      ].sort(),
    );
    expect(db.pet_cautions.map((c) => c.text)).toEqual(["No knocking — text me instead"]);

    // The builder is empty again; a new line is appended to the same table.
    await expect(screen.getByTestId("lines")).toHaveCount(0);
    await screen.getByTestId("line-kind-walk").click();
    await screen.getByTestId("line-span-once").click(); // one time only, not every day
    await screen.getByTestId("line-add").click();
    await expect(screen.getByTestId("lines")).toContainText("Walk · 5:00 PM once");
    await screen.getByTestId("care-request-make").click();
    await expect(screen.locator("[data-testid^='draft-time-']")).toHaveCount(5);
    await expect(screen.getByTestId("checklist-table")).toContainText("once");
    await expect(screen.getByTestId("save-state")).toHaveText("✓ All changes saved");
    expect(db.care_tasks).toHaveLength(5);
    expect(db.care_tasks.find((t) => t.type === "walk")?.repeat_daily).toBe(false);
    expect(db.care_tasks.filter((t) => t.repeat_daily).length).toBe(4);
  });

  test("editing saves by itself; removing saves too, and Undo brings the row back", async ({ page }) => {
    const { db } = await setup(page);
    const screen = await openBuilder(page);
    await screen.getByTestId("line-kind-meal").click();
    await screen.getByTestId("line-add").click();
    await screen.getByTestId("care-request-make").click();
    await expect(screen.getByTestId("save-state")).toHaveText("✓ All changes saved");
    const key = (await screen.locator("[data-testid^='draft-title-']").getAttribute("data-testid"))!.replace("draft-title-", "");

    await screen.getByTestId(`draft-title-${key}`).fill("Breakfast");
    await expect(screen.getByTestId("save-state")).toHaveText("✓ All changes saved");
    expect(db.care_tasks.map((t) => t.title)).toEqual(["Breakfast"]);

    await screen.getByTestId(`draft-remove-${key}`).click();
    await expect(screen.getByTestId("undo-bar")).toContainText("Removed Breakfast");
    await expect.poll(() => db.care_tasks.length).toBe(0); // the delete was saved

    await screen.getByTestId("undo-restore").click();
    await expect(screen.getByTestId("checklist-table")).toContainText("Meal");
    await expect.poll(() => db.care_tasks.length).toBe(1); // …and so is the undo
    await expect(screen.getByTestId("save-state")).toHaveText("✓ All changes saved");
  });

  test("leaving the screen right after an edit still saves it", async ({ page }) => {
    const { db } = await setup(page);
    const screen = await openBuilder(page);
    await screen.getByTestId("line-kind-meal").click();
    await screen.getByTestId("line-add").click();
    await screen.getByTestId("care-request-make").click();
    await expect(screen.getByTestId("save-state")).toHaveText("✓ All changes saved");
    const key = (await screen.locator("[data-testid^='draft-title-']").getAttribute("data-testid"))!.replace("draft-title-", "");
    await screen.getByTestId(`draft-title-${key}`).fill("Supper");
    await page.goBack(); // before the autosave pause is over
    await expect.poll(() => db.care_tasks.map((t) => t.title)).toEqual(["Supper"]);
  });

  test("the helper tidies a line; when it is down the owner's own words stay and nothing breaks", async ({ page }) => {
    const { setPlan, calls } = await setup(page, {
      plan: { tasks: [{ type: "feeding", time: "08:00", title: "Breakfast", dose: "1 cup of kibble", notes: "Warm it first" }], cautions: [], skipped: [], model: "m", latency_ms: 1 },
    });
    const screen = await openBuilder(page);
    await screen.getByTestId("line-kind-meal").click();
    await screen.getByTestId("line-add").click();
    await screen.getByTestId("care-request-make").click();
    await expect(screen.locator("[data-testid^='draft-title-']")).toHaveValue("Breakfast");
    expect(calls).toHaveLength(1);

    setPlan({ status: 503, detail: "The checklist helper is unavailable right now." });
    await screen.getByTestId("line-kind-walk").click();
    await screen.getByTestId("line-add").click();
    await screen.getByTestId("care-request-make").click();
    await expect(screen.locator("[data-testid^='draft-title-']")).toHaveCount(2);
    await expect(screen.getByTestId("error-dialog")).toHaveCount(0);
  });

  test("what the helper left out is a red box; tap an item to dismiss it", async ({ page }) => {
    await setup(page, {
      petId: MOCHI,
      plan: { tasks: [], cautions: [], skipped: [{ type: "feeding", title: "Raw diet", reason: "Not something we can schedule." }], model: "m", latency_ms: 1 },
    });
    const screen = await openBuilder(page);
    await screen.getByTestId("line-kind-meal").click();
    await screen.getByTestId("line-add").click();
    await screen.getByTestId("care-request-make").click();
    await expect(screen.getByTestId("checklist-skipped")).toContainText("Raw diet — Not something we can schedule.");
    await screen.locator("[data-testid^='skipped-ack-']").click();
    await expect(screen.getByTestId("checklist-skipped")).toHaveCount(0);
  });

  test("a line needs text; more than 12 tasks is refused with a message", async ({ page }) => {
    await setup(page);
    const screen = await openBuilder(page);
    await expect(screen.getByTestId("care-request-make")).toBeDisabled();
    await screen.getByTestId("line-kind-headsup").click();
    await expect(screen.getByTestId("line-add")).toBeDisabled();

    await screen.getByTestId("line-kind-meal").click();
    await screen.getByTestId("line-mode-count").click();
    for (let i = 0; i < 4; i++) await screen.getByTestId("line-count-plus").click(); // 6 times
    await screen.getByTestId("line-add").click();
    await screen.getByTestId("line-kind-medication").click();
    await screen.getByTestId("line-mode-count").click();
    for (let i = 0; i < 4; i++) await screen.getByTestId("line-count-plus").click();
    await screen.getByTestId("line-add").click();
    await screen.getByTestId("line-kind-walk").click();
    await screen.getByTestId("line-add").click(); // 13 tasks
    await screen.getByTestId("care-request-make").click();
    await expect(screen.getByTestId("error-dialog-message")).toContainText("12 tasks");
  });
});

test.describe("care request (a stay is on)", () => {
  test("the owner sends a request instead of saving; the sitter approves it and the tasks appear", async ({ page }) => {
    const { db } = await setup(page, { stay: true });
    const screen = await openBuilder(page);
    await expect(screen.getByTestId("care-request-heading")).toHaveText("Write a care request");

    await screen.getByTestId("line-kind-meal").click();
    await screen.getByTestId("line-add").click();
    await screen.getByTestId("line-kind-headsup").click();
    await screen.getByTestId("line-text").fill("Text, don't knock");
    await screen.getByTestId("line-add").click();
    await screen.getByTestId("care-request-make").click();
    await expect(screen.getByTestId("save-state")).toHaveCount(0); // nothing is saved by itself now
    expect(db.care_tasks).toHaveLength(0);
    expect(db.pet_cautions).toHaveLength(0);

    await screen.getByTestId("care-request-send").click();
    await expect(screen.getByTestId("toast")).toContainText("Request sent to");
    expect(db.care_tasks).toHaveLength(0); // still nothing until approved
    expect(db.care_change_requests).toHaveLength(1);
    await expect(screen.getByTestId("request-status")).toContainText("Waiting for");

    // Another request can't pile on while one is open.
    await screen.getByTestId("care-request-open").click();
    await expect(screen.getByTestId("request-pending")).toBeVisible();
  });

  test("sitter Home shows the waiting request; Approve adds the tasks and Heads-up", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    caring(db, [{ id: MAX, name: "Max", species: "dog" }]);
    db.care_change_requests.push({
      id: "req-1",
      pet_id: MAX,
      booking_id: "b1",
      requested_by: OWNER.id,
      sitter_id: SITTER.id,
      status: "pending",
      tasks: [{ type: "feeding", time: "19:00", title: "Late snack", dose: "a few treats", notes: null, repeat: false }],
      cautions: ["Never feed grapes"],
      decline_reason: null,
      created_at: new Date().toISOString(),
    });
    await signIn(page, SITTER);
    const screen = app(page);
    await screen.getByTestId("request-line").click();
    await expect(screen.getByTestId("request-tasks")).toContainText("Late snack");
    await expect(screen.getByTestId("request-tasks")).toContainText("once");
    await expect(screen.getByTestId("request-cautions")).toContainText("Never feed grapes");
    await screen.getByTestId("request-approve").click();
    await expect(screen.getByTestId("toast")).toContainText("Added to Max's tasks");
    expect(db.care_tasks.map((t) => [t.title, t.repeat_daily])).toEqual([["Late snack", false]]);
    expect(db.pet_cautions.map((c) => c.text)).toEqual(["Never feed grapes"]);
    expect(db.notifications.find((n) => n.type === "care_request_approved")?.user_id).toBe(OWNER.id);
  });

  test("a declined request shows the sitter's reason on the pet screen", async ({ page }) => {
    const { db } = await setup(page, { stay: true });
    db.care_change_requests.push({
      id: "req-3",
      pet_id: MAX,
      booking_id: "b1",
      requested_by: OWNER.id,
      sitter_id: SITTER.id,
      status: "declined",
      tasks: [],
      cautions: ["x"],
      decline_reason: "Needs a different time",
      created_at: new Date().toISOString(),
    });
    await page.goto(`/owner/pets/${MAX}`);
    await expect(app(page).getByTestId("request-status")).toContainText("Needs a different time");
  });

  test("Decline needs a polite reason, which the owner sees", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    caring(db, [{ id: MAX, name: "Max", species: "dog" }]);
    db.care_change_requests.push({
      id: "req-2",
      pet_id: MAX,
      booking_id: "b1",
      requested_by: OWNER.id,
      sitter_id: SITTER.id,
      status: "pending",
      tasks: [{ type: "walk", time: "22:00", title: "Night walk", dose: null, notes: null }],
      cautions: [],
      decline_reason: null,
      created_at: new Date().toISOString(),
    });
    await signIn(page, SITTER);
    const screen = app(page);
    await page.goto("/sitter/care-request/req-2");
    await screen.getByTestId("request-decline").click();
    await expect(screen.getByTestId("decline-confirm")).toBeDisabled();
    await screen.getByTestId("decline-reason-1").click();
    await screen.getByTestId("decline-confirm").click();
    await expect(screen.getByTestId("toast")).toContainText("Declined");
    expect(db.care_tasks).toHaveLength(0);
    expect(db.care_change_requests[0]).toMatchObject({ status: "declined", decline_reason: "Let's talk first" });
    expect(db.notifications.find((n) => n.type === "care_request_declined")).toMatchObject({ user_id: OWNER.id, body: "Let's talk first" });
  });

  test("a decline can carry a note; a note also opens a counter-request with a fee and tasks for the owner", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    caring(db, [{ id: MAX, name: "Max", species: "dog" }]);
    const request = (id: string) => ({
      id,
      pet_id: MAX,
      booking_id: "b1",
      requested_by: OWNER.id,
      sitter_id: SITTER.id,
      status: "pending",
      tasks: [
        { type: "feeding", time: "06:00", title: "Early meal", dose: null, notes: null },
        { type: "walk", time: "23:00", title: "Late walk", dose: null, notes: null },
      ],
      cautions: ["Porch light on"],
      decline_reason: null,
      note: null,
      counter_fee_cents: null,
      counter_owner_tasks: [],
      created_at: new Date().toISOString(),
    });
    db.care_change_requests.push(request("req-a"));
    await signIn(page, SITTER);
    const screen = app(page);

    // A note alone: Decline carries it. No counter box until there is a note.
    await page.goto("/sitter/care-request/req-a");
    await screen.getByTestId("request-decline").click();
    await expect(screen.getByTestId("counter-box")).toHaveCount(0);
    await screen.getByTestId("decline-note").fill("Could we do 7 AM instead?");
    await expect(screen.getByTestId("counter-box")).toBeVisible();

    // …which turns into a counter-request: a fee, and the late walk is for the owner.
    await screen.getByTestId("counter-fee").fill("5");
    await screen.getByTestId("counter-owner-1").click();
    await screen.getByTestId("counter-send").click();
    await expect(screen.getByTestId("toast")).toContainText("Counter-request sent");
    expect(db.care_tasks).toHaveLength(0);
    expect(db.care_change_requests[0]).toMatchObject({ status: "countered", note: "Could we do 7 AM instead?", counter_fee_cents: 500, counter_owner_tasks: [1] });
    expect(db.notifications.find((n) => n.type === "care_request_countered")?.user_id).toBe(OWNER.id);
  });

  test("owner: a decline stays pinned on Home until read, then it is gone; the answer stays on the pet screen", async ({ page }) => {
    const { db } = await setup(page, { stay: true });
    db.care_change_requests.push({
      id: "req-d",
      pet_id: MAX,
      booking_id: "b1",
      requested_by: OWNER.id,
      sitter_id: SITTER.id,
      status: "declined",
      tasks: [],
      cautions: ["x"],
      decline_reason: "Needs a different time",
      note: "Could we do 5 PM?",
      counter_fee_cents: null,
      counter_owner_tasks: [],
      created_at: new Date().toISOString(),
    });
    db.notifications.push({
      id: "n-decl",
      user_id: OWNER.id,
      type: "care_request_declined",
      title: "Lucy couldn't take this one for Max",
      body: "Needs a different time — Could we do 5 PM?",
      pet_id: MAX,
      booking_id: "b1",
      ref_id: "req-d",
      read_at: null,
      created_at: new Date().toISOString(),
    });
    await page.goto("/owner");
    const screen = app(page);
    await expect(screen.getByTestId("live-pinned-n-decl")).toBeVisible();
    await expect(screen.getByTestId("live-swipe-n-decl")).toHaveCount(0); // no swiping it away unread
    await screen.getByTestId("live-x").click();
    await screen.getByTestId("live-clear-all").click();
    await expect(screen.getByTestId("live-pinned-n-decl")).toBeVisible(); // Clear all leaves it too

    await page.reload();
    await expect(app(page).getByTestId("live-pinned-n-decl")).toBeVisible(); // still there after a refresh

    await screen.getByTestId("live-n-decl").click();
    await expect(screen.getByTestId("notice-detail-memo")).toContainText("Could we do 5 PM?");
    // Read it and close: it is gone from Home (the answer stays on the pet screen).
    await screen.getByTestId("notice-detail-close").click();
    await expect(screen.getByTestId("notice-detail")).toHaveCount(0);
    await expect(page).toHaveURL(/\/owner$/); // Close just closes
    await expect(screen.getByTestId("live-n-decl")).toHaveCount(0);
    await page.reload();
    await screen.getByTestId("live-updates").waitFor();
    await expect(screen.getByTestId("live-n-decl")).toHaveCount(0);
    await page.goto(`/owner/pets/${MAX}`);
    await expect(page).toHaveURL(new RegExp(`/owner/pets/${MAX}$`));
    await expect(screen.getByTestId("request-status")).toContainText("Could we do 5 PM?");
  });

  test("owner: accepting a counter-request adds only what the sitter agreed to; the fee and the owner's tasks are shown", async ({ page }) => {
    const { db } = await setup(page, { stay: true });
    db.care_change_requests.push({
      id: "req-c",
      pet_id: MAX,
      booking_id: "b1",
      requested_by: OWNER.id,
      sitter_id: SITTER.id,
      status: "countered",
      tasks: [
        { type: "feeding", time: "06:00", title: "Early meal", dose: null, notes: null },
        { type: "walk", time: "23:00", title: "Late walk", dose: null, notes: null },
      ],
      cautions: ["Porch light on"],
      decline_reason: null,
      note: "I can do the meal for a small fee.",
      counter_fee_cents: 500,
      counter_owner_tasks: [1],
      created_at: new Date().toISOString(),
    });
    await page.goto(`/owner/pets/${MAX}`);
    const screen = app(page);
    await expect(screen.getByTestId("counter-reply")).toContainText("I can do the meal for a small fee.");
    await expect(screen.getByTestId("counter-fee-line")).toHaveText("Extra fee: $5.00");
    await expect(screen.getByTestId("counter-owner-line")).toContainText("Late walk");
    await screen.getByTestId("counter-accept").click();
    await expect(screen.getByTestId("toast")).toContainText("Accepted");
    expect(db.care_tasks.map((t) => t.title)).toEqual(["Early meal"]); // the late walk stays with the owner
    expect(db.pet_cautions.map((c) => c.text)).toEqual(["Porch light on"]);
    expect(db.notifications.find((n) => n.type === "care_counter_accepted")?.user_id).toBe(SITTER.id);
    await expect(screen.getByTestId("counter-reply")).toHaveCount(0);
  });

  test("owner: a counter-request stays on Home after reading, until it is answered", async ({ page }) => {
    const { db } = await setup(page, { stay: true });
    db.care_change_requests.push({
      id: "req-k",
      pet_id: MAX,
      booking_id: "b1",
      requested_by: OWNER.id,
      sitter_id: SITTER.id,
      status: "countered",
      tasks: [{ type: "feeding", time: "06:00", title: "Early meal", dose: null, notes: null }],
      cautions: [],
      decline_reason: null,
      note: "A small fee, please.",
      counter_fee_cents: 300,
      counter_owner_tasks: [],
      created_at: new Date().toISOString(),
    });
    db.notifications.push({
      id: "n-ctr",
      user_id: OWNER.id,
      type: "care_request_countered",
      title: "Lucy sent a counter-request for Max 💬",
      body: "A small fee, please.",
      pet_id: MAX,
      booking_id: "b1",
      ref_id: "req-k",
      read_at: null,
      created_at: new Date().toISOString(),
    });
    await page.goto("/owner");
    const screen = app(page);
    await screen.getByTestId("live-n-ctr").click();
    await screen.getByTestId("notice-detail-close").click();
    await expect(screen.getByTestId("live-pinned-n-ctr")).toBeVisible(); // read, but not answered yet

    await page.goto(`/owner/pets/${MAX}`);
    await screen.getByTestId("counter-accept").click();
    await expect(screen.getByTestId("toast")).toContainText("Accepted");
    await page.goto("/owner");
    await screen.getByTestId("live-updates").waitFor();
    await expect(screen.getByTestId("live-n-ctr")).toHaveCount(0); // answered → gone
  });
});
