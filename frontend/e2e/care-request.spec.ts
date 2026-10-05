import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { app, signIn } from "./helpers";
import { OWNER, mockSupabase } from "./supabaseMock";

// Care request (phase-06 6.13): note → Make a checklist → review and fix → Save.

const MAX = "00000000-0000-4000-8000-0000000000aa";
const MOCHI = "00000000-0000-4000-8000-0000000000bb";

const NOTE =
  "Meals: 8:00 AM — 1 cup of kibble\nMedication: 2:00 PM — 1 skin pill, hidden in a lickable treat\nHeads-up: No knocking — text me instead.";

const PLAN = {
  tasks: [
    { type: "feeding", time: "08:00", title: "Breakfast", dose: "1 cup of kibble", notes: null },
    { type: "medication", time: "14:00", title: "Skin pill", dose: "1 skin pill, hidden in a lickable treat", notes: null },
  ],
  cautions: ["No knocking or doorbell — text me instead.", "Keep other dogs away on walks."],
  skipped: [],
  model: "nvidia/test-model",
  latency_ms: 900,
};

async function setup(page: Page, petId = MAX, plan: object | { status: number; detail: string } = PLAN) {
  const { db } = await mockSupabase(page, [OWNER]);
  db.pets.push(
    { id: MAX, owner_id: OWNER.id, species: "dog", name: "Max", breed: null, birthdate: null, weight_kg: null, notes: null, created_at: "2026-10-01T09:00:00Z" },
    { id: MOCHI, owner_id: OWNER.id, species: "cat", name: "Mochi", breed: null, birthdate: null, weight_kg: null, notes: null, created_at: "2026-10-01T09:05:00Z" },
  );
  const calls: { pet_id: string; text: string }[] = [];
  let current = plan;
  await page.route("**/api/ai/care-plan", (route) => {
    calls.push(route.request().postDataJSON());
    if ("status" in current) {
      return route.fulfill({ status: current.status, contentType: "application/json", body: JSON.stringify({ detail: current.detail }) });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(current) });
  });
  await signIn(page, OWNER);
  await app(page).getByRole("heading", { name: "Home" }).waitFor();
  await page.goto(`/owner/pets/${petId}`);
  await app(page).getByTestId("care-tasks").waitFor();
  return { db, calls, setPlan: (next: typeof plan) => (current = next) };
}

test.describe("care request", () => {
  test("write a note → checklist → fix it → save writes the note, tasks and Heads-ups together", async ({ page }) => {
    const { db, calls } = await setup(page);
    const screen = app(page);

    await screen.getByTestId("care-request-open").click();
    await expect(page).toHaveURL(new RegExp(`/owner/pets/${MAX}/care-request$`));
    await expect(screen.getByTestId("care-request-make")).toBeDisabled(); // nothing written yet
    await screen.getByTestId("care-request-text").fill(NOTE);
    await screen.getByTestId("care-request-make").click();

    // The draft: two tasks and two Heads-ups. Nothing is saved yet.
    await expect(screen.getByTestId("checklist")).toBeVisible();
    expect(calls).toEqual([{ pet_id: MAX, text: NOTE }]);
    expect(db.care_requests).toHaveLength(0);
    expect(db.care_tasks).toHaveLength(0);

    // Fix a name, change a time by tapping, drop a task, drop a Heads-up, add one.
    const breakfast = (await screen.locator("[data-testid^='draft-title-']").first().getAttribute("data-testid"))!;
    const breakfastKey = breakfast.replace("draft-title-", "");
    await screen.getByTestId(breakfast).fill("Morning kibble");
    await screen.getByTestId(`draft-time-${breakfastKey}`).click();
    await screen.getByTestId("time-ampm-am").click();
    await screen.getByTestId("time-hour-7").click();
    await screen.getByTestId("time-min-30").click();
    await screen.getByTestId("time-picker-set").click();
    await expect(screen.getByTestId(`draft-time-${breakfastKey}`)).toContainText("7:30 AM");

    await screen.getByTestId("caution-1").getByLabel("Remove Keep other dogs away on walks.").click();
    await screen.getByTestId("caution-input").fill("Use the side gate");
    await screen.getByTestId("caution-add").click();

    await screen.getByTestId("care-request-save").click();
    await expect(screen.getByTestId("toast")).toContainText("Saved 2 tasks and 2 Heads-ups for Max");

    expect(db.care_requests).toHaveLength(1);
    expect(db.care_requests[0]).toMatchObject({ pet_id: MAX, raw_text: NOTE, model: "nvidia/test-model" });
    expect(db.care_tasks.map((t) => [t.title, t.scheduled_time, t.type])).toEqual([
      ["Morning kibble", "07:30:00", "feeding"],
      ["Skin pill", "14:00:00", "medication"],
    ]);
    expect(db.pet_cautions.map((c) => c.text)).toEqual(["No knocking or doorbell — text me instead.", "Use the side gate"]);

    // Back on the pet, the new tasks are already in Care tasks.
    await expect(page).toHaveURL(new RegExp(`/owner/pets/${MAX}$`));
    await expect(screen.getByText("Morning kibble")).toBeVisible();
    await expect(screen.getByText("7:30 AM · every day · 1 cup of kibble")).toBeVisible();
  });

  test("a cat's walk is shown as left out, with the reason", async ({ page }) => {
    await setup(page, MOCHI, {
      tasks: [{ type: "feeding", time: "07:00", title: "Breakfast", dose: "half a can", notes: null }],
      cautions: [],
      skipped: [{ type: "walk", title: "Walk", reason: "Cats don't go on walks." }],
      model: "nvidia/test-model",
      latency_ms: 800,
    });
    const screen = app(page);
    await screen.getByTestId("care-request-open").click();
    await screen.getByTestId("care-request-text").fill("breakfast at 7, walk at 5 PM");
    await screen.getByTestId("care-request-make").click();
    await expect(screen.getByTestId("checklist-skipped")).toContainText("Walk — Cats don't go on walks.");
    await expect(screen.locator("[data-testid^='draft-title-']")).toHaveCount(1);
  });

  test("nothing found: says so, and Save has nothing to save", async ({ page }) => {
    const { db } = await setup(page, MAX, { tasks: [], cautions: [], skipped: [], model: "m", latency_ms: 1 });
    const screen = app(page);
    await screen.getByTestId("care-request-open").click();
    await screen.getByTestId("care-request-text").fill("be nice to him");
    await screen.getByTestId("care-request-make").click();
    await expect(screen.getByTestId("checklist-empty")).toBeVisible();
    await screen.getByTestId("care-request-save").click();
    await expect(screen.getByTestId("error-dialog-message")).toContainText("Add a task or a Heads-up first");
    expect(db.saves).toHaveLength(0);
  });

  test("when the helper is unavailable a dialog stays; Try again works", async ({ page }) => {
    const { setPlan, calls } = await setup(page, MAX, { status: 503, detail: "The checklist helper is unavailable right now. You can add tasks by hand." });
    const screen = app(page);
    await screen.getByTestId("care-request-open").click();
    await screen.getByTestId("care-request-text").fill(NOTE);
    await screen.getByTestId("care-request-make").click();

    await expect(screen.getByTestId("error-dialog-message")).toContainText("add tasks by hand");
    await page.waitForTimeout(3500);
    await expect(screen.getByTestId("error-dialog")).toBeVisible();

    setPlan(PLAN);
    await screen.getByTestId("error-dialog-retry").click();
    await expect(screen.getByTestId("checklist")).toBeVisible();
    expect(calls).toHaveLength(2);
    await expect(screen.getByTestId("care-request-text")).toHaveValue(NOTE); // the note was kept
  });

  test("a refused save keeps the draft and saves nothing", async ({ page }) => {
    const { db } = await setup(page, MAX, {
      tasks: [{ type: "walk", time: "17:00", title: "Walk", dose: null, notes: null }],
      cautions: [],
      skipped: [],
      model: "m",
      latency_ms: 1,
    });
    const screen = app(page);
    // The server says the pet can't do this task (a dog-only draft sent to a cat, e.g. after a species slip):
    // simulate by flipping the pet to a cat after the draft was made.
    await screen.getByTestId("care-request-open").click();
    await screen.getByTestId("care-request-text").fill("walk at 5 PM");
    await screen.getByTestId("care-request-make").click();
    await screen.getByTestId("checklist").waitFor();
    db.pets.find((p) => p.id === MAX)!.species = "cat";
    await screen.getByTestId("care-request-save").click();
    await expect(screen.getByTestId("error-dialog-message")).toContainText("doesn't fit this pet");
    expect(db.care_requests).toHaveLength(0);
    expect(db.care_tasks).toHaveLength(0);
    await screen.getByTestId("error-dialog-close").click();
    await expect(screen.getByTestId("checklist")).toBeVisible(); // still there to fix
  });

  test("an empty note can't be made into a checklist; editing the note clears the old draft", async ({ page }) => {
    await setup(page);
    const screen = app(page);
    await screen.getByTestId("care-request-open").click();
    await expect(screen.getByTestId("care-request-make")).toBeDisabled();
    await screen.getByTestId("care-request-text").fill(NOTE);
    await screen.getByTestId("care-request-make").click();
    await screen.getByTestId("checklist").waitFor();
    await screen.getByTestId("care-request-text").fill(NOTE + " Also: dinner at 6.");
    await expect(screen.getByTestId("checklist")).toHaveCount(0);
  });
});
