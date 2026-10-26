import { expect, test } from "@playwright/test";
import type { FrameLocator, Page } from "@playwright/test";

import { app, signIn } from "./helpers";
import { SITTER, mockSupabase } from "./supabaseMock";

// Sitter onboarding (3D.2, #139): one question per screen, choices as big options, a note box behind "+", a voice
// screen first, a review step, every question skippable.

const KEYS = [
  "custom_1",
  "multiple_owners",
  "max_pets",
  "walks_per_day",
  "activity",
  "park_nearby",
  "dog_sizes",
  "cats",
  "handoff",
];

async function newSitter(page: Page) {
  const { db } = await mockSupabase(page, [SITTER]);
  db.sitter_profiles.push({ id: SITTER.id, bio: null, onboarded_at: null });
  return db;
}

/** Go on (Skip on a question, Next on the extras, Review on the last one) until the wanted screen is up. */
async function skipTo(screen: FrameLocator, testId: string) {
  for (let i = 0; i < 16; i++) {
    if (await screen.getByTestId(testId).count()) return;
    for (const id of [
      "onboarding-skip",
      "onboarding-next",
      "onboarding-review",
    ]) {
      const button = screen.getByTestId(id);
      if (await button.count()) {
        await button.click();
        break;
      }
    }
  }
  await expect(screen.getByTestId(testId)).toBeVisible();
}

test.describe("sitter onboarding", () => {
  test("a new sitter answers one question per screen, reviews them and finishes", async ({
    page,
  }) => {
    const db = await newSitter(page);
    await signIn(page, SITTER);
    await expect(page).toHaveURL(/\/sitter-onboarding$/);
    const screen = app(page);

    await expect(screen.getByTestId("onboarding-step-voice")).toBeVisible();
    await screen.getByTestId("onboarding-skip").click();

    // One question on the screen; a single pick goes on by itself.
    await expect(screen.getByTestId("onboarding-q-custom_1")).toBeVisible();
    await expect(screen.getByTestId("own-title")).toHaveText(
      "Do you have your own pets at home?",
    );
    await screen.getByTestId("onboarding-choice-custom_1-yes").click();

    await expect(
      screen.getByTestId("onboarding-q-multiple_owners"),
    ).toBeVisible();
    await expect(screen.getByTestId("own-title")).toHaveText(
      "Do you take pets from multiple families?",
    );
    // One Back, the ← arrow at the top, and Skip at the bottom (#383, U1).
    await expect(screen.getByTestId("own-back")).toHaveAttribute("aria-label", "Back");
    await expect(screen.getByTestId("own-back-bottom")).toHaveCount(0);
    await expect(screen.getByTestId("onboarding-skip")).toBeVisible();
    await screen.getByTestId("onboarding-choice-multiple_owners-yes").click();
    await expect(screen.getByTestId("onboarding-q-max_pets")).toBeVisible();
    await expect(
      screen.getByTestId("onboarding-choice-max_pets-3"),
    ).toContainText("3+");
    await screen.getByTestId("onboarding-choice-max_pets-3").click();

    // A note stays behind the "+"; with a note open the screen waits for Next.
    await expect(
      screen.getByTestId("onboarding-q-walks_per_day"),
    ).toBeVisible();
    await expect(
      screen.getByTestId("onboarding-note-walks_per_day"),
    ).toHaveCount(0);
    await screen.getByTestId("onboarding-note-toggle-walks_per_day").click();
    await screen
      .getByTestId("onboarding-note-walks_per_day")
      .fill("Three, one long");
    await screen.getByTestId("onboarding-note-toggle-walks_per_day").click();
    await expect(
      screen.getByTestId("onboarding-note-walks_per_day"),
    ).toHaveCount(0);
    await screen.getByTestId("onboarding-note-toggle-walks_per_day").click();
    await expect(
      screen.getByTestId("onboarding-note-walks_per_day"),
    ).toHaveValue("Three, one long");
    await screen.getByTestId("onboarding-choice-walks_per_day-3").click();
    await expect(
      screen.getByTestId("onboarding-q-walks_per_day"),
    ).toBeVisible(); // did not move on: the note is open
    await screen.getByTestId("onboarding-next").click();

    await skipTo(screen, "onboarding-q-dog_sizes");
    await expect(screen.getByText("Pick all that fit.")).toBeVisible();
    await screen.getByTestId("onboarding-choice-dog_sizes-small").click();
    await screen.getByTestId("onboarding-choice-dog_sizes-large").click();
    await expect(screen.getByTestId("onboarding-q-dog_sizes")).toBeVisible(); // several picks wait for Next
    await screen.getByTestId("onboarding-next").click();
    await skipTo(screen, "onboarding-q-handoff");
    await screen.getByTestId("onboarding-choice-handoff-owner_brings").click();
    await screen
      .getByTestId("onboarding-choice-handoff-sitter_picks_up")
      .click();
    await screen.getByTestId("onboarding-next").click();

    await expect(screen.getByTestId("onboarding-custom")).toBeVisible();
    await screen.getByTestId("onboarding-custom-add").click();
    await screen
      .getByTestId("onboarding-custom-q-0")
      .fill("Do you have a fenced yard?");
    await screen.getByTestId("onboarding-custom-a-0").fill("Yes, a small one");
    await screen.getByTestId("onboarding-next").click();
    await screen.getByTestId("onboarding-next").click(); // availability, untouched
    await screen.getByTestId("onboarding-intro").fill("Hi, I am Chloe.");

    await screen.getByTestId("onboarding-review").click();
    await expect(
      screen.getByTestId("onboarding-review-dog_sizes"),
    ).toContainText("Small (<15 lbs / 7 kg), Large (41+ lbs / 18+ kg)");
    await expect(
      screen.getByTestId("onboarding-review-walks_per_day"),
    ).toContainText("Three, one long");
    await expect(screen.getByTestId("onboarding-review-handoff")).toContainText(
      "I can pick up, Owner drops off",
    );
    await expect(screen.getByTestId("onboarding-skipped")).toContainText(
      "3 skipped",
    );
    await expect(screen.getByTestId("onboarding-review-intro")).toContainText(
      "Hi, I am Chloe.",
    );

    // Back to edit keeps what was typed.
    await screen.getByTestId("onboarding-back").click();
    await expect(screen.getByTestId("onboarding-intro")).toHaveValue(
      "Hi, I am Chloe.",
    );
    await screen.getByTestId("onboarding-review").click();
    await screen.getByTestId("onboarding-finish").click();

    await expect(page).toHaveURL(/\/sitter$/);
    const rows = db.sitter_profile_answers.filter(
      (r) => r.sitter_id === SITTER.id,
    );
    expect(rows.map((r) => r.question_key)).toEqual([
      "custom_1",
      "multiple_owners",
      "max_pets",
      "walks_per_day",
      "dog_sizes",
      "handoff",
      "custom_1",
    ]);
    expect(rows.find((r) => r.question_key === "walks_per_day")).toMatchObject({
      choice: "3",
      answer: "Three, one long",
    });
    expect(rows.find((r) => r.question_key === "dog_sizes")?.choice).toBe(
      "small,large",
    );
    expect(rows.find((r) => r.question_key === "handoff")?.choice).toBe(
      "sitter_picks_up,owner_brings",
    );
    expect(rows.find((r) => r.question_text)?.question_text).toBe(
      "Do you have a fenced yard?",
    );
    const profile = db.sitter_profiles.find((p) => p.id === SITTER.id);
    expect(profile?.bio).toBe("Hi, I am Chloe.");
    expect(profile?.onboarded_at).not.toBeNull();
  });

  test("every question can be skipped", async ({ page }) => {
    const db = await newSitter(page);
    await signIn(page, SITTER);
    await expect(page).toHaveURL(/\/sitter-onboarding$/);

    await app(page).getByTestId("onboarding-skip-all").click();
    await expect(page).toHaveURL(/\/sitter$/);
    expect(
      db.sitter_profile_answers.filter((r) => r.sitter_id === SITTER.id),
    ).toHaveLength(0);
    expect(
      db.sitter_profiles.find((p) => p.id === SITTER.id)?.onboarded_at,
    ).not.toBeNull();
  });

  test("Back goes to the screen before, and a sitter can skip the questions one by one", async ({
    page,
  }) => {
    await newSitter(page);
    await signIn(page, SITTER);
    const screen = app(page);
    await screen.getByTestId("onboarding-skip").click();
    await screen.getByTestId("onboarding-skip").click();
    await screen.getByTestId("onboarding-skip").click();
    await expect(screen.getByTestId("onboarding-q-max_pets")).toBeVisible();
    await screen.getByTestId("own-back").click();
    await expect(
      screen.getByTestId("onboarding-q-multiple_owners"),
    ).toBeVisible();
    await skipTo(screen, "onboarding-review-step");
    await expect(screen.getByTestId("onboarding-review-step")).toContainText(
      "Nothing answered yet.",
    );
  });

  test("a sitter who finished is not sent back, and can edit the answers from Profile", async ({
    page,
  }) => {
    const { db } = await mockSupabase(page, [SITTER]);
    db.sitter_profiles.push({
      id: SITTER.id,
      bio: null,
      home_address: null,
      services: ["boarding"],
      onboarded_at: "2026-10-01T00:00:00Z",
    });
    db.sitter_profile_answers.push({
      sitter_id: SITTER.id,
      question_key: "cats",
      question_text: null,
      answer: null,
      choice: "no",
      position: 0,
    });
    await signIn(page, SITTER);
    await expect(page).toHaveURL(/\/sitter$/);
    const screen = app(page);

    await screen.getByTestId("open-menu").click();
    await screen.getByTestId("open-profile").click();
    // The saved answers are listed read only on Profile, with the answered questions only.
    await expect(screen.getByTestId("profile-answers-list")).toContainText(
      "Do you take cats?",
    );
    await expect(screen.getByTestId("profile-answers-list")).not.toContainText(
      "walks a day",
    );
    await screen.getByTestId("profile-answers-edit").click();
    await expect(page).toHaveURL(/\/sitter-onboarding\?edit=1$/);
    await expect(screen.getByTestId("onboarding-skip-all")).toHaveCount(0);
    await skipTo(screen, "onboarding-q-cats");
    await expect(
      screen.getByTestId("onboarding-choice-cats-no"),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(
      screen.getByTestId("onboarding-choice-walks_per_day-4"),
    ).toHaveCount(0);

    await screen.getByTestId("onboarding-choice-cats-no").click(); // tap again = skipped
    await expect(screen.getByTestId("onboarding-q-cats")).toBeVisible();
    await screen.getByTestId("onboarding-choice-cats-yes").click();
    await skipTo(screen, "onboarding-review-step");
    await screen.getByTestId("onboarding-finish").click();
    expect(
      db.sitter_profile_answers.find(
        (r) => r.sitter_id === SITTER.id && r.question_key === "cats",
      )?.choice,
    ).toBe("yes");
  });

  test("When can you host?: the weekly rules go to the schedule when the sitter finishes", async ({
    page,
  }) => {
    const db = await newSitter(page);
    await signIn(page, SITTER);
    await expect(page).toHaveURL(/\/sitter-onboarding$/);
    const screen = app(page);

    await skipTo(screen, "onboarding-availability");
    await expect(
      screen.getByTestId("onboarding-availability-summary"),
    ).toHaveText("Open every day.");
    await screen.getByTestId("onboarding-availability-open").click();
    await screen.getByTestId("rule-overnight-0").click();
    await screen.getByTestId("rule-overnight-6").click();
    await screen.getByTestId("rules-apply").click();
    await expect(
      screen.getByTestId("onboarding-availability-summary"),
    ).toHaveText("Closed: Sun, Sat night.");
    // Nothing is written until Finish.
    expect(db.sitter_closing_rules).toHaveLength(0);

    await skipTo(screen, "onboarding-step-intro");
    await screen.getByTestId("onboarding-review").click();
    await expect(
      screen.getByTestId("onboarding-review-availability"),
    ).toContainText("Closed: Sun, Sat night.");
    await screen.getByTestId("onboarding-finish").click();
    await expect(page).toHaveURL(/\/sitter$/);

    expect(
      db.sitter_closing_rules.map((r) => `${r.weekday}:${r.slot}`).sort(),
    ).toEqual(["0:overnight", "6:overnight"]);
    expect(
      db.sitter_availability.filter((r) => r.sitter_id === SITTER.id),
    ).toHaveLength(0);
  });

  test("an untouched availability section leaves the schedule alone", async ({
    page,
  }) => {
    const db = await newSitter(page);
    db.sitter_closing_rules.push({
      sitter_id: SITTER.id,
      weekday: 3,
      slot: "morning",
    });
    await signIn(page, SITTER);
    await expect(page).toHaveURL(/\/sitter-onboarding$/);
    const screen = app(page);

    await skipTo(screen, "onboarding-availability");
    await expect(
      screen.getByTestId("onboarding-availability-summary"),
    ).toHaveText("Closed: Wed morning.");
    await skipTo(screen, "onboarding-step-intro");
    await screen.getByTestId("onboarding-review").click();
    await screen.getByTestId("onboarding-finish").click();
    await expect(page).toHaveURL(/\/sitter$/);
    expect(db.sitter_closing_rules).toHaveLength(1);
    expect(
      db.sitter_availability.filter((r) => r.sitter_id === SITTER.id),
    ).toHaveLength(0);
  });

  test("voice: what the sitter says is suggested on the questions, never final", async ({
    page,
  }) => {
    const db = await newSitter(page);
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "mediaDevices", {
        configurable: true,
        value: {
          getUserMedia: async () => ({
            getTracks: () => [{ stop: () => undefined }],
          }),
        },
      });
      class FakeRecorder {
        mimeType = "audio/webm";
        state = "inactive";
        ondataavailable: ((e: { data: Blob }) => void) | null = null;
        onstop: (() => void) | null = null;
        static isTypeSupported() {
          return true;
        }
        start() {
          this.state = "recording";
        }
        stop() {
          this.state = "inactive";
          this.ondataavailable?.({
            data: new Blob([new Uint8Array(2000)], { type: "audio/webm" }),
          });
          this.onstop?.();
        }
      }
      (window as unknown as { MediaRecorder: unknown }).MediaRecorder =
        FakeRecorder;
    });
    const json = (body: unknown, status = 200) => ({
      status,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
    let asked: {
      transcript: string;
      questions: {
        key: string;
        multi: boolean;
        options: { value: string }[];
      }[];
    } | null = null;
    await page.route("**/api/ai/pet-voice/transcribe", (route) =>
      route.fulfill(
        json({
          transcript: "I take small and large dogs, up to three at a time.",
        }),
      ),
    );
    await page.route("**/api/ai/sitter-voice", (route) => {
      asked = route.request().postDataJSON();
      return route.fulfill(
        json({
          answers: {
            dog_sizes: { value: "small,large", quote: "small and large dogs" },
            max_pets: { value: "3", quote: "up to three at a time" },
          },
          model: "nano",
          latency_ms: 200,
        }),
      );
    });
    await signIn(page, SITTER);
    const screen = app(page);
    await expect(screen.getByTestId("own-title")).toHaveText(
      "Tell us how you look after pets",
    );
    await screen.getByTestId("own-mic").click();
    await screen.getByTestId("own-mic").click();
    await expect(screen.getByTestId("own-voice-text")).toHaveValue(
      "I take small and large dogs, up to three at a time.",
    );
    await screen.getByTestId("own-voice-use").click();

    expect(asked!.questions.map((q) => q.key)).toEqual(KEYS);
    expect(asked!.questions.find((q) => q.key === "dog_sizes")).toMatchObject({
      multi: true,
    });
    // The first questions are not about anything said; the ones that were come chosen, with the words and a mark.
    await expect(screen.getByTestId("onboarding-q-custom_1")).toBeVisible();
    await expect(
      screen.getByTestId("onboarding-heard-custom_1"),
    ).toHaveCount(0);
    await screen.getByTestId("onboarding-skip").click();
    await expect(
      screen.getByTestId("onboarding-q-multiple_owners"),
    ).toBeVisible();
    await screen.getByTestId("onboarding-skip").click();
    await expect(screen.getByTestId("onboarding-heard-max_pets")).toContainText(
      "up to three at a time",
    );
    await expect(
      screen.getByTestId("onboarding-choice-max_pets-3"),
    ).toContainText("Suggested");
    await expect(
      screen.getByTestId("onboarding-choice-max_pets-3"),
    ).toHaveAttribute("aria-pressed", "true");
    // Changing it takes the mark away.
    await screen.getByTestId("onboarding-choice-max_pets-2").click();
    await skipTo(screen, "onboarding-q-dog_sizes");
    await expect(
      screen.getByTestId("onboarding-choice-dog_sizes-small"),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(
      screen.getByTestId("onboarding-choice-dog_sizes-large"),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(
      screen.getByTestId("onboarding-choice-dog_sizes-medium"),
    ).not.toHaveAttribute("aria-pressed", "true");
    await skipTo(screen, "onboarding-step-intro");
    await screen.getByTestId("onboarding-review").click();
    await screen.getByTestId("onboarding-finish").click();
    await expect(page).toHaveURL(/\/sitter$/);
    const rows = db.sitter_profile_answers.filter(
      (r) => r.sitter_id === SITTER.id,
    );
    expect(rows.map((r) => [r.question_key, r.choice])).toEqual([
      ["max_pets", "2"],
      ["dog_sizes", "small,large"],
    ]);
  });

  test("voice: a failed reading says so and the sitter answers the questions themselves", async ({
    page,
  }) => {
    await newSitter(page);
    await page.addInitScript(() => {
      (window as unknown as { MediaRecorder?: unknown }).MediaRecorder =
        undefined;
    });
    await page.route("**/api/ai/sitter-voice", (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          detail:
            "We couldn't read that just now. You can answer the questions yourself.",
        }),
      }),
    );
    await signIn(page, SITTER);
    const screen = app(page);
    await expect(screen.getByTestId("own-mic")).toHaveCount(0);
    await screen.getByTestId("own-voice-text").fill("I take small dogs.");
    await screen.getByTestId("own-voice-use").click();
    await expect(screen.getByTestId("own-voice-error")).toContainText(
      "answer the questions yourself",
    );
    await screen.getByTestId("onboarding-skip").click();
    await expect(screen.getByTestId("onboarding-q-custom_1")).toBeVisible();
  });
});
