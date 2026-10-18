import { expect, test } from "@playwright/test";

import { app, signIn } from "./helpers";
import { SITTER, mockSupabase } from "./supabaseMock";

// Sitter onboarding (3D.2, #139): a numbered list, notes and chips, a review step, every question skippable.

test.describe("sitter onboarding", () => {
  test("a new sitter answers some questions, reviews them and finishes", async ({ page }) => {
    const { db } = await mockSupabase(page, [SITTER]);
    db.sitter_profiles.push({ id: SITTER.id, bio: null, onboarded_at: null });
    await signIn(page, SITTER);
    await expect(page).toHaveURL(/\/sitter-onboarding$/);
    const screen = app(page);

    await expect(screen.getByTestId("onboarding-q-multiple_owners")).toContainText("1. Do you look after pets");
    await screen.getByTestId("onboarding-choice-multiple_owners-yes").click();
    await screen.getByTestId("onboarding-choice-max_pets-3").click();
    await screen.getByTestId("onboarding-note-walks_per_day").fill("Three, one long");
    await screen.getByTestId("onboarding-choice-dog_sizes-small").click();
    await screen.getByTestId("onboarding-choice-dog_sizes-large").click();
    await screen.getByTestId("onboarding-choice-handoff-owner_brings").click();
    await screen.getByTestId("onboarding-custom-add").click();
    await screen.getByTestId("onboarding-custom-q-0").fill("Do you have a fenced yard?");
    await screen.getByTestId("onboarding-custom-a-0").fill("Yes, a small one");
    await screen.getByTestId("onboarding-intro").fill("Hi, I am Chloe.");

    await screen.getByTestId("onboarding-review").click();
    await expect(screen.getByTestId("onboarding-review-dog_sizes")).toContainText("Small, Large");
    await expect(screen.getByTestId("onboarding-review-walks_per_day")).toContainText("Three, one long");
    await expect(screen.getByTestId("onboarding-skipped")).toContainText("5 skipped");
    await expect(screen.getByTestId("onboarding-review-intro")).toContainText("Hi, I am Chloe.");

    // Back to edit keeps what was typed.
    await screen.getByTestId("onboarding-back").click();
    await expect(screen.getByTestId("onboarding-note-walks_per_day")).toHaveValue("Three, one long");
    await screen.getByTestId("onboarding-review").click();
    await screen.getByTestId("onboarding-finish").click();

    await expect(page).toHaveURL(/\/sitter$/);
    const rows = db.sitter_profile_answers.filter((r) => r.sitter_id === SITTER.id);
    expect(rows.map((r) => r.question_key)).toEqual(["multiple_owners", "max_pets", "walks_per_day", "dog_sizes", "handoff", "custom_1"]);
    expect(rows.find((r) => r.question_key === "dog_sizes")?.choice).toBe("small,large");
    expect(rows.find((r) => r.question_key === "custom_1")?.question_text).toBe("Do you have a fenced yard?");
    const profile = db.sitter_profiles.find((p) => p.id === SITTER.id);
    expect(profile?.bio).toBe("Hi, I am Chloe.");
    expect(profile?.onboarded_at).not.toBeNull();
  });

  test("every question can be skipped", async ({ page }) => {
    const { db } = await mockSupabase(page, [SITTER]);
    db.sitter_profiles.push({ id: SITTER.id, bio: null, onboarded_at: null });
    await signIn(page, SITTER);
    await expect(page).toHaveURL(/\/sitter-onboarding$/);

    await app(page).getByTestId("onboarding-skip-all").click();
    await expect(page).toHaveURL(/\/sitter$/);
    expect(db.sitter_profile_answers.filter((r) => r.sitter_id === SITTER.id)).toHaveLength(0);
    expect(db.sitter_profiles.find((p) => p.id === SITTER.id)?.onboarded_at).not.toBeNull();
  });

  test("a sitter who finished is not sent back, and can edit the answers from Profile", async ({ page }) => {
    const { db } = await mockSupabase(page, [SITTER]);
    db.sitter_profiles.push({
      id: SITTER.id, bio: null, home_address: null, services: ["boarding"], onboarded_at: "2026-10-01T00:00:00Z",
    });
    db.sitter_profile_answers.push({ sitter_id: SITTER.id, question_key: "cats", question_text: null, answer: null, choice: "no", position: 0 });
    await signIn(page, SITTER);
    await expect(page).toHaveURL(/\/sitter$/);
    const screen = app(page);

    await screen.getByTestId("open-menu").click();
    await screen.getByTestId("open-profile").click();
    await screen.getByTestId("profile-answers-edit").click();
    await expect(page).toHaveURL(/\/sitter-onboarding\?edit=1$/);
    await expect(screen.getByTestId("onboarding-skip-all")).toHaveCount(0);
    await expect(screen.getByTestId("onboarding-choice-cats-no")).toHaveAttribute("aria-checked", "true");

    await screen.getByTestId("onboarding-choice-cats-no").click(); // tap again = skipped
    await screen.getByTestId("onboarding-choice-cats-yes").click();
    await screen.getByTestId("onboarding-review").click();
    await screen.getByTestId("onboarding-finish").click();
    expect(db.sitter_profile_answers.find((r) => r.sitter_id === SITTER.id && r.question_key === "cats")?.choice).toBe("yes");
  });

  test("When can you host?: weekly rules and a day off go to the schedule when the sitter finishes", async ({ page }) => {
    const { db } = await mockSupabase(page, [SITTER]);
    db.sitter_profiles.push({ id: SITTER.id, bio: null, onboarded_at: null });
    await signIn(page, SITTER);
    await expect(page).toHaveURL(/\/sitter-onboarding$/);
    const screen = app(page);

    await expect(screen.getByTestId("onboarding-availability-summary")).toHaveText("Open every day.");
    await screen.getByTestId("onboarding-availability-open").click();
    await screen.getByTestId("rule-overnight-0").click();
    await screen.getByTestId("rule-overnight-6").click();
    await screen.getByTestId("rules-apply").click();
    await expect(screen.getByTestId("onboarding-availability-summary")).toHaveText("Closed: Sun, Sat night.");
    // Nothing is written until Finish.
    expect(db.sitter_closing_rules).toHaveLength(0);

    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto" }).format(new Date());
    await screen.getByTestId("onboarding-dayoff-add").click();
    await screen.getByTestId(`onboarding-dayoff-picker-${today}`).click();
    await expect(screen.getByTestId(`onboarding-dayoff-remove-${today}`)).toBeVisible();

    await screen.getByTestId("onboarding-review").click();
    await expect(screen.getByTestId("onboarding-review-availability")).toContainText("Closed: Sun, Sat night.");
    await expect(screen.getByTestId("onboarding-review-availability")).toContainText("Days off:");
    await screen.getByTestId("onboarding-finish").click();
    await expect(page).toHaveURL(/\/sitter$/);

    expect(db.sitter_closing_rules.map((r) => `${r.weekday}:${r.slot}`).sort()).toEqual(["0:overnight", "6:overnight"]);
    const blocked = db.sitter_availability.filter((r) => r.sitter_id === SITTER.id && r.kind === "blocked");
    expect(blocked.map((r) => r.slot).sort()).toEqual(["afternoon", "morning", "overnight"]);
    expect(blocked.every((r) => r.start_date === today && r.end_date === today)).toBe(true);
  });

  test("an untouched availability section leaves the schedule alone", async ({ page }) => {
    const { db } = await mockSupabase(page, [SITTER]);
    db.sitter_profiles.push({ id: SITTER.id, bio: null, onboarded_at: null });
    db.sitter_closing_rules.push({ sitter_id: SITTER.id, weekday: 3, slot: "morning" });
    await signIn(page, SITTER);
    await expect(page).toHaveURL(/\/sitter-onboarding$/);
    const screen = app(page);

    await expect(screen.getByTestId("onboarding-availability-summary")).toHaveText("Closed: Wed morning.");
    await screen.getByTestId("onboarding-choice-cats-yes").click();
    await screen.getByTestId("onboarding-review").click();
    await screen.getByTestId("onboarding-finish").click();
    await expect(page).toHaveURL(/\/sitter$/);
    expect(db.sitter_closing_rules).toHaveLength(1);
    expect(db.sitter_availability.filter((r) => r.sitter_id === SITTER.id)).toHaveLength(0);
  });
});
