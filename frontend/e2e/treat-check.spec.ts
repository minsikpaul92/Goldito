import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { caring, mockUpload } from "./careFixtures";
import { APP_FRAME, app, box, isInside, signIn } from "./helpers";
import { MockDb, MockUser, OWNER, SITTER, mockSupabase } from "./supabaseMock";

// Snap → Treat check (Phase 12.1c, D61): pick the pet → snap a label (sample tray) → DANGER / WARNING / SAFE.
// The AI endpoint is mocked (pytest covers the real pipeline); the mock also writes the row the API would insert.

const MAX = "00000000-0000-4000-8000-0000000000aa";
const MOCHI = "00000000-0000-4000-8000-0000000000bb";
const OTHER = "00000000-0000-4000-8000-0000000000cc";
const CHECK = "00000000-0000-4000-8000-00000000c001";

const ASPCA = { title: "People Foods to Avoid Feeding Your Pets", url: "https://www.aspca.org/pet-care/foods", domain: "aspca.org" };

function result(status: "SAFE" | "WARNING" | "DANGER", extra: object = {}) {
  return {
    safety_check_id: CHECK,
    safety_status: status,
    product_name: "Tender Strips",
    detected_ingredients: ["chicken breast", "vegetable glycerin", "sweet potato"],
    matched_allergens: [],
    hidden_sources: [],
    toxic_ingredients: [],
    unknown_ingredients: [],
    sources: [ASPCA],
    sources_unavailable: false,
    double_checked: true,
    partial_label: false,
    warning_message: "",
    model: "m",
    latency_ms: 900,
    ...extra,
  };
}

type Reply = { status: number; body: object; delayMs?: number };

async function open(page: Page, user: MockUser, replies: Reply[], seed: (db: MockDb) => void) {
  const { db } = await mockSupabase(page, [OWNER, SITTER]);
  seed(db);
  const signed = await mockUpload(page, db, MAX);
  const asked: Record<string, unknown>[] = [];
  await page.route("**/api/ai/safety-check", async (route) => {
    const body = route.request().postDataJSON();
    asked.push(body);
    const reply = replies[Math.min(asked.length - 1, replies.length - 1)];
    if (reply.delayMs) await new Promise((r) => setTimeout(r, reply.delayMs));
    if (reply.status === 200) {
      const r = reply.body as ReturnType<typeof result>;
      db.safety_checks.push({
        id: r.safety_check_id,
        pet_id: body.pet_id,
        checked_by: user.id,
        media_id: body.media_id,
        safety_status: r.safety_status,
        result_json: r,
        acknowledged_at: null,
        created_at: new Date().toISOString(),
      });
    }
    return route.fulfill({ status: reply.status, contentType: "application/json", body: JSON.stringify(reply.body) });
  });
  await signIn(page, user);
  await expect(page).toHaveURL(user.role === "owner" ? /\/owner$/ : /\/sitter$/);
  await page.goto(`/${user.role}/snap/treat`);
  return { db, asked, signed };
}

function ownerPets(db: MockDb) {
  db.pets.push({ id: MAX, owner_id: OWNER.id, species: "dog", name: "Max", breed: null, notes: null });
  db.pets.push({ id: MOCHI, owner_id: OWNER.id, species: "cat", name: "Mochi", breed: null, notes: null });
  db.pet_allergies.push({ id: "al-1", pet_id: MAX, allergen: "chicken" });
}

async function snapSample(page: Page, sample: string) {
  const screen = app(page);
  await screen.getByTestId("treat-snap").click();
  await screen.getByTestId(`sample-${sample}`).click();
  await screen.getByTestId("media-confirm-use").click();
}

test.describe("treat check", () => {
  test("owner: chicken jerky for Max → a red screen that only 'I understand' closes, and it is recorded", async ({ page }) => {
    const danger = result("DANGER", {
      matched_allergens: ["chicken"],
      warning_message: "This treat has chicken, and Max is allergic to chicken.",
    });
    const { db, asked, signed } = await open(page, OWNER, [{ status: 200, body: danger, delayMs: 800 }], ownerPets);
    const screen = app(page);

    // Two pets → nothing picked yet; the button says so.
    await expect(screen.getByTestId("treat-snap")).toContainText("Pick a pet first");
    await expect(screen.getByTestId("treat-disclaimer")).toContainText("AI can be wrong");
    await screen.getByTestId(`treat-pet-${MAX}`).click();
    await snapSample(page, "chicken_jerky");
    await expect(screen.getByTestId("treat-busy-text")).toHaveText("Reading the label…");

    const modal = screen.getByTestId("treat-danger");
    await expect(modal).toBeVisible();
    await expect(modal).toContainText("Don't give this to Max");
    await expect(screen.getByTestId("treat-danger-message")).toContainText("allergic to chicken");
    await expect(screen.getByTestId("treat-danger-chip")).toHaveText("chicken");
    expect(asked).toEqual([{ pet_id: MAX, media_id: "media-proof" }]);
    expect(signed[0]).toMatchObject({ pet_id: MAX, purpose: "safety_label", resource_type: "image" });

    // Inside the phone frame, and Escape or a click at the edge does not close it.
    expect(isInside(await box(modal), await box(page.locator(APP_FRAME)))).toBe(true);
    await page.keyboard.press("Escape");
    const frame = await box(page.locator(APP_FRAME));
    await page.mouse.click(frame.x + 10, frame.y + 10);
    await expect(modal).toBeVisible();
    expect(db.safety_checks[0].acknowledged_at).toBeNull();

    await screen.getByTestId("treat-danger-acknowledge").click();
    await expect(modal).toHaveCount(0);
    expect(db.safety_checks[0].acknowledged_at).not.toBeNull();
    // The result stays on the screen, with the disclaimer at the bottom.
    await expect(screen.getByTestId("treat-result-danger")).toContainText("Not safe for Max");
    await expect(screen.getByTestId("treat-snap")).toContainText("Check another treat");
    await expect(screen.getByTestId("treat-recent-row")).toHaveCount(1);
    await expect(screen.getByTestId("treat-disclaimer")).toBeVisible();
  });

  test("sitter: only the pets in care; a WARNING says ask the owner, explains the hidden source and links its sources", async ({ page }) => {
    const warning = result("WARNING", {
      product_name: "Crunchy Bites",
      hidden_sources: [{ ingredient: "animal fat", may_contain: "chicken", reason: "The label does not say which animal." }],
      warning_message: "Animal fat may come from chicken.",
    });
    await open(page, SITTER, [{ status: 200, body: warning }], (db) => {
      caring(db, [{ id: MAX, name: "Max", species: "dog" }]);
      db.pets.push({ id: OTHER, owner_id: OWNER.id, species: "dog", name: "Rex", breed: null, notes: null });
    });
    const screen = app(page);

    // One pet in care → picked already; a pet not in this stay is not offered.
    await expect(screen.getByTestId(`treat-pet-${MAX}`)).toBeVisible();
    await expect(screen.getByTestId(`treat-pet-${OTHER}`)).toHaveCount(0);
    await snapSample(page, "animal_fat_biscuit");

    const card = screen.getByTestId("treat-result-warning");
    await expect(card).toContainText("Ask the owner first");
    await expect(screen.getByTestId("treat-hidden")).toContainText("animal fat may contain chicken");
    await expect(screen.getByTestId("treat-source")).toContainText("aspca.org");
    await expect(screen.getByTestId("treat-danger")).toHaveCount(0);
    await screen.getByTestId("treat-ingredients-toggle").click();
    await expect(screen.getByTestId("treat-ingredients")).toContainText("sweet potato");
  });

  test("sitter with no pet in care sees why the tool is closed", async ({ page }) => {
    await open(page, SITTER, [{ status: 200, body: result("SAFE") }], () => undefined);
    await expect(app(page).getByTestId("treat-no-pets")).toContainText("No pet in your care right now");
  });

  test("SAFE is green, and missing sources, a rules-only result or a partly read label say so", async ({ page }) => {
    const { asked } = await open(
      page,
      OWNER,
      [
        { status: 200, body: result("SAFE", { product_name: "Garden Chews", sources: [], sources_unavailable: true }) },
        { status: 200, body: result("WARNING", { double_checked: false, sources: [], sources_unavailable: true }) },
        { status: 200, body: result("WARNING", { partial_label: true }) },
      ],
      ownerPets,
    );
    const screen = app(page);
    await screen.getByTestId(`treat-pet-${MAX}`).click();
    await snapSample(page, "sweet_potato_chew");
    await expect(screen.getByTestId("treat-result-safe")).toContainText("Looks fine for Max ✅");
    await expect(screen.getByTestId("treat-sources-unavailable")).toContainText("Sources unavailable right now");

    await snapSample(page, "sweet_potato_chew");
    await expect(screen.getByTestId("treat-result-warning")).toContainText("Check with your vet first");
    await expect(screen.getByTestId("treat-not-double-checked")).toBeVisible();

    // SR-1: a list cut off in the photo is never SAFE and asks for a retake.
    await snapSample(page, "sweet_potato_chew");
    await expect(screen.getByTestId("treat-partial")).toContainText("only read part of the label");
    await expect(screen.getByTestId("treat-snap")).toContainText("Retake photo");
    expect(asked).toHaveLength(3);
  });

  test("an unreadable label asks for a closer photo; a server error offers Try again without a new upload", async ({ page }) => {
    const { asked, signed } = await open(
      page,
      OWNER,
      [
        { status: 422, body: { detail: "Couldn't read the label." } },
        { status: 503, body: { detail: "Couldn't read the label right now. Try again in a moment." } },
        { status: 200, body: result("SAFE") },
      ],
      ownerPets,
    );
    const screen = app(page);
    await screen.getByTestId(`treat-pet-${MAX}`).click();
    await snapSample(page, "chicken_jerky");
    await expect(screen.getByTestId("treat-unreadable")).toContainText("Try a closer, well-lit photo");
    await expect(screen.getByTestId("treat-snap")).toContainText("Retake photo");

    await snapSample(page, "chicken_jerky");
    await expect(screen.getByTestId("error-dialog-message")).toContainText("Try again in a moment");
    await screen.getByTestId("error-dialog-retry").click();
    await expect(screen.getByTestId("treat-result-safe")).toBeVisible();
    expect(asked).toHaveLength(3);
    expect(asked[2]).toEqual(asked[1]); // the same photo, checked again…
    expect(signed).toHaveLength(2); // …without uploading it again
  });

  test("owner: the sitter's DANGER notice opens that check with its red screen", async ({ page }) => {
    await open(page, OWNER, [], (db) => {
      ownerPets(db);
      db.safety_checks.push({
        id: CHECK,
        pet_id: MAX,
        checked_by: SITTER.id,
        media_id: "m1",
        safety_status: "DANGER",
        result_json: result("DANGER", { matched_allergens: ["chicken"], warning_message: "Chicken — Max is allergic." }),
        acknowledged_at: null,
        created_at: new Date().toISOString(),
      });
    });
    await page.goto(`/owner/snap/treat?check=${CHECK}`);
    const screen = app(page);
    await expect(screen.getByTestId("treat-danger-message")).toContainText("Max is allergic");
    await screen.getByTestId("treat-danger-acknowledge").click();
    await expect(screen.getByTestId("treat-danger")).toHaveCount(0);
    await expect(screen.getByTestId("treat-result-danger")).toBeVisible();
    await expect(screen.getByTestId(`treat-pet-${MAX}`)).toHaveAttribute("aria-selected", "true");
  });
});
