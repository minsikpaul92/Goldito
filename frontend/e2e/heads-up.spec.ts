import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { caring, task as fixtureTask } from "./careFixtures";
import { app, signIn } from "./helpers";
import { OWNER, SITTER, mockSupabase } from "./supabaseMock";
import type { MockDb } from "./supabaseMock";

// Heads-ups (phase-06 6.14): the owner manages them; the sitter sees them on Home and on the booking.

const MAX = { id: "00000000-0000-4000-8000-0000000000aa", name: "Max", species: "dog" } as const;
const MOCHI = { id: "00000000-0000-4000-8000-0000000000bb", name: "Mochi", species: "cat" } as const;
const MIN = 60_000;
const at = (ms: number) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: "America/Toronto", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(
    new Date(ms),
  );
const day = (ms: number) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto" }).format(new Date(ms));

const caution = (db: MockDb, id: string, pet: { id: string }, text: string, active = true) =>
  db.pet_cautions.push({ id, pet_id: pet.id, text, active, created_at: `2026-10-04T10:0${id.length}:00Z` });

test.describe("owner manages Heads-ups", () => {
  async function ownerPet(page: Page) {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    db.pets.push({ id: MAX.id, owner_id: OWNER.id, species: "dog", name: "Max", breed: null, birthdate: null, weight_kg: null, notes: null, created_at: "2026-10-01T09:00:00Z" });
    await signIn(page, OWNER);
    await app(page).getByRole("heading", { name: "Home" }).waitFor();
    return db;
  }

  test("an empty list explains itself; add one, a repeat is ignored, remove it", async ({ page }) => {
    const db = await ownerPet(page);
    await page.goto(`/owner/pets/${MAX.id}`);
    const screen = app(page);
    await expect(screen.getByTestId("heads-up-empty")).toBeVisible();

    await screen.getByTestId("heads-up-input").fill("No knocking — text me");
    await screen.getByTestId("heads-up-add").click();
    await expect(screen.getByText("No knocking — text me")).toBeVisible();
    expect(db.pet_cautions).toHaveLength(1);
    expect(db.pet_cautions[0]).toMatchObject({ pet_id: MAX.id, text: "No knocking — text me", created_by: OWNER.id });
    await expect(screen.getByTestId("heads-up-input")).toHaveValue("");

    await screen.getByTestId("heads-up-input").fill("no knocking — TEXT me"); // same thing, other case
    await screen.getByTestId("heads-up-add").click();
    expect(db.pet_cautions).toHaveLength(1);

    await screen.getByLabel("Remove No knocking — text me").click();
    await expect(screen.getByTestId("heads-up-empty")).toBeVisible();
    expect(db.pet_cautions).toHaveLength(0);
  });

  test("shows the ones a care request saved; switched-off ones stay hidden", async ({ page }) => {
    const db = await ownerPet(page);
    caution(db, "c1", MAX, "Keep other dogs away on walks.");
    caution(db, "c2x", MAX, "Old rule", false);
    await page.goto(`/owner/pets/${MAX.id}`);
    await expect(app(page).getByText("Keep other dogs away on walks.")).toBeVisible();
    await expect(app(page).getByText("Old rule")).toHaveCount(0);
  });
});

test.describe("what the sitter sees", () => {
  test("the booking detail shows each pet's Heads-ups first, active ones only", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    caring(db, [MAX, MOCHI]);
    caution(db, "c1", MAX, "Text instead of knocking");
    caution(db, "c2", MAX, "Keep other dogs away on walks");
    caution(db, "c3x", MAX, "An old, switched-off rule", false);
    await signIn(page, SITTER);
    await app(page).getByRole("heading", { name: "Home" }).waitFor();
    await page.goto("/sitter/bookings/b1");
    const screen = app(page);

    const max = screen.getByTestId("heads-up-Max");
    await expect(max).toContainText("Text instead of knocking");
    await expect(max).toContainText("Keep other dogs away on walks");
    await expect(max).not.toContainText("old, switched-off");
    await expect(screen.getByTestId("heads-up-Mochi")).toHaveCount(0); // nothing for Mochi
  });

  test("Home shows one line, the sheet lists them by pet with the owner's name, and Home still fits one screen", async ({ page }) => {
    const now = Date.now();
    test.skip(day(now) !== day(now + 40 * MIN), "too close to midnight in Toronto");
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    caring(db, [MAX, MOCHI]);
    db.care_tasks.push(
      fixtureTask(MAX.id, "t1", "feeding", "Breakfast", at(now + 10 * MIN)),
      fixtureTask(MOCHI.id, "t2", "litter", "Litter box", at(now + 30 * MIN)),
    );
    caution(db, "c1", MAX, "Text instead of knocking");
    caution(db, "c2", MAX, "Keep other dogs away on walks");
    caution(db, "c3", MOCHI, "Close the door gently");
    await signIn(page, SITTER);
    const screen = app(page);
    await screen.getByTestId("headsup-compact").waitFor();

    await expect(screen.getByTestId("headsup-compact")).toContainText("Max: Text instead of knocking");
    await expect(screen.getByTestId("headsup-compact")).toContainText("+2");
    expect(await screen.getByTestId("sitter-home").evaluate((el) => el.scrollHeight <= el.clientHeight + 1)).toBe(true);

    await screen.getByTestId("headsup-compact").click();
    const sheet = screen.getByTestId("headsup-sheet");
    await expect(sheet).toContainText("Max — from Chloe");
    await expect(sheet).toContainText("Keep other dogs away on walks");
    await expect(sheet).toContainText("Mochi — from Chloe");
    await expect(sheet).toContainText("Close the door gently");
  });

  test("no Heads-ups, no card", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    caring(db, [MAX]);
    await signIn(page, SITTER);
    await app(page).getByTestId("sitter-dashboard").waitFor();
    await expect(app(page).getByTestId("headsup-compact")).toHaveCount(0);
  });
});
