import { expect, test } from "@playwright/test";

import { app, signIn } from "./helpers";
import { OWNER, mockSupabase } from "./supabaseMock";

// Owner sign-up questions (11.15 S1, #185): one question per screen, large text, every question skippable.

let uploads = 0;

/** The pet photo routes: sign, the Cloudinary upload, and complete (the ids it is asked to register, in order). */
async function mockPetPhotos(page: import("@playwright/test").Page): Promise<string[]> {
  const completed: string[] = [];
  const json = (body: unknown, status = 200) => ({ status, contentType: "application/json", body: JSON.stringify(body) });
  await page.route("**/api/pet-photos/sign", (route) =>
    route.fulfill(
      json({
        cloud_name: "goldito-test", api_key: "123", timestamp: 1_700_000_000, signature: "sig",
        folder: `goldito/pet-profile/${OWNER.id}`,
        upload_url: "http://127.0.0.1:4173/cloudinary-mock/image/upload",
        transformation: "c_limit,w_2000/q_auto",
      }),
    ),
  );
  await page.route("**/cloudinary-mock/**", (route) => {
    uploads += 1;
    return route.fulfill(json({ public_id: `goldito/pet-profile/${OWNER.id}/pet-${uploads}`, width: 800, height: 800 }));
  });
  await page.route("**/api/pet-photos/complete", (route) => {
    completed.push(route.request().postDataJSON().public_id);
    return route.fulfill(json({ id: `p-${completed.length}`, pet_id: "x", public_id: "x", position: 0, url: "", thumb_url: "" }));
  });
  return completed;
}

async function addPhoto(page: import("@playwright/test").Page, sample: string) {
  const screen = app(page);
  await screen.getByTestId("own-photo-add").click();
  await screen.getByTestId(`sample-${sample}`).click();
  await expect(screen.getByTestId("crop-image")).toBeVisible();
  await screen.getByTestId("crop-confirm").click();
  await expect(screen.getByTestId("crop-sheet")).toHaveCount(0);
}

async function newOwner(page: import("@playwright/test").Page) {
  const { db } = await mockSupabase(page, [OWNER]);
  db.owner_profiles.push({ id: OWNER.id, home_address: null, home_lat: null, home_lng: null, onboarded_at: null });
  return db;
}

/** Skips every optional screen after the name until the summary (the question screens all have a Skip). */
async function skipToSummary(page: import("@playwright/test").Page) {
  const screen = app(page);
  const skip = screen.getByTestId("own-skip");
  const summary = screen.getByTestId("own-step-summary");
  const about = screen.getByTestId("own-step-about");
  for (let i = 0; i < 80; i++) {
    await expect(skip.or(summary).or(about)).toBeVisible();
    if (await summary.isVisible()) return;
    if (await about.isVisible()) await screen.getByTestId("own-next").click();
    else await skip.click();
  }
}

test.describe("owner onboarding", () => {
  test("a new owner answers, checks the summary and saves their first pet", async ({ page }) => {
    const db = await newOwner(page);
    const completed = await mockPetPhotos(page);
    await page.route("**/api/geo/suggest", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ results: [{ label: "100 Queen St W, Toronto", lat: 43.6534, lng: -79.3841 }] }),
      }),
    );
    await page.route("**/api/breed-needs", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          chips: [{ kind: "grooming", text: "Brush daily", source: 0 }],
          sources: [{ title: "AKC", url: "https://www.akc.org/dog-breeds/maltese/" }],
          origin: "list",
          basis: null,
        }),
      }),
    );
    await signIn(page, OWNER);
    await expect(page).toHaveURL(/\/owner-onboarding$/);
    const screen = app(page);

    await expect(screen.getByTestId("step-brand")).toBeVisible();
    await expect(screen.getByTestId("own-title")).toHaveText("What kind of pet do you have?");
    await screen.getByTestId("own-species-dog").click();
    await screen.getByTestId("own-next").click();
    await expect(screen.getByTestId("own-step-name")).toBeVisible();
    await expect(screen.getByTestId("own-title")).toHaveText("What's your pet's name?");
    await expect(screen.getByTestId("own-next")).toBeDisabled();
    await screen.getByTestId("own-name").fill("Pip");
    await screen.getByTestId("own-next").click();

    // Photos: add two, make the second the cover. Next waits until something is added.
    await expect(screen.getByTestId("own-title")).toHaveText("Add photos of Pip");
    await expect(screen.getByTestId("own-next")).toBeDisabled();
    await addPhoto(page, "mood_tug");
    await addPhoto(page, "mood_grass");
    await expect(screen.getByTestId("own-photo-1")).toBeVisible();
    await screen.getByTestId("own-photo-1").click();
    await screen.getByTestId("own-photo-cover").click();
    await screen.getByTestId("own-next").click();

    // Voice is optional: skip it here (the next test uses it).
    await expect(screen.getByTestId("own-title")).toHaveText("Tell us about Pip");
    await screen.getByTestId("own-skip").click();

    await expect(screen.getByTestId("own-title")).toHaveText("What breed is Pip?");
    await screen.getByTestId("own-breed").fill("Maltese");
    await screen.getByTestId("own-next").click();
    await expect(screen.getByTestId("own-title")).toHaveText("What color is Pip?");
    await screen.getByTestId("own-coat-white").click();
    await expect(screen.getByTestId("own-title")).toHaveText("How old is Pip?");
    await screen.getByTestId("own-age-plus").click();
    await screen.getByTestId("own-next").click();
    await screen.getByTestId("own-weight").fill("6,5");
    await screen.getByTestId("own-next").click();
    await expect(screen.getByTestId("own-title")).toHaveText("Tell us about Pip");
    await screen.getByTestId("own-pet-intro").fill("Loves the sofa.");
    await screen.getByTestId("own-next").click();

    // Before the questions: where they come from, with links to the surveys they were inspired by.
    await expect(screen.getByTestId("own-title")).toHaveText("Where these questions come from");
    await expect(screen.getByTestId("own-sources")).toContainText("MCPQ-R");
    await expect(screen.getByTestId("own-sources")).toContainText("C-BARQ");
    await expect(screen.getByText("It is not a behavior test.")).toBeVisible();
    await screen.getByTestId("own-next").click();

    // The 12 chart questions: the name is in every question, a tap goes on by itself.
    await expect(screen.getByTestId("own-title")).toHaveText("When a guest visits, Pip…");
    for (let i = 1; i <= 12; i++) {
      await expect(screen.getByTestId(`own-step-q:d${i}`)).toBeVisible();
      await screen.getByTestId(i <= 6 ? "own-opt-4" : "own-opt-2").click();
    }

    // Safety: bites once, not sure about others, the rest skipped.
    await expect(screen.getByTestId("own-title")).toHaveText("Has Pip ever bitten or snapped at a person?");
    await screen.getByTestId("own-safe-once").click();
    await expect(screen.getByTestId("own-step-s:s2")).toBeVisible();
    await screen.getByTestId("own-safe-unsure").click();
    for (const key of ["s3", "s4", "s5"]) {
      await expect(screen.getByTestId(`own-step-s:${key}`)).toBeVisible();
      await screen.getByTestId("own-skip").click();
    }
    await expect(screen.getByTestId("own-step-foods")).toBeVisible();
    await screen.getByTestId("own-food-chicken").click();
    await screen.getByTestId("own-food-else").click();
    await screen.getByTestId("own-food-other-input").fill("Grapes");
    await screen.getByTestId("own-food-other-add").click();
    await screen.getByTestId("own-next").click();

    // About the owner, then where they live (a real address picked from the check).
    await expect(screen.getByTestId("own-title")).toHaveText("A few words about you");
    await screen.getByTestId("own-intro").fill("Hi, I am Robert.");
    await screen.getByTestId("own-next").click();
    await expect(screen.getByTestId("own-title")).toHaveText("Where do you live?");
    await expect(screen.getByTestId("own-next")).toBeDisabled();
    await screen.getByTestId("own-address").fill("100 Queen St W");
    await screen.getByTestId("own-address-check-address").click();
    await screen.getByTestId("own-address-suggestion-1").click();
    await expect(screen.getByTestId("own-address-address-ok")).toBeVisible();
    await screen.getByTestId("own-next").click();

    await expect(screen.getByTestId("own-title")).toHaveText("Meet Pip");
    await expect(screen.getByTestId("own-row-about-you")).toContainText("Hi, I am Robert.");
    await expect(screen.getByTestId("own-row-home")).toContainText("100 Queen St W, Toronto");
    // The card the sitter will see, from the answers so far.
    const glance = screen.getByTestId("own-glance");
    await expect(glance).toContainText("Pip at a glance");
    await expect(glance).toContainText("Dog · Maltese");
    await expect(glance.getByTestId("own-glance-chart")).toContainText("Very sensitive");
    await expect(glance.getByTestId("own-glance-chart")).toContainText("Steady");
    await expect(glance).toContainText("No chicken");
    await expect(glance.getByTestId("own-glance-needs")).toContainText("Grooming: Brush daily");
    await expect(screen.getByTestId("own-row-photos")).toContainText("2");
    await expect(screen.getByTestId("own-row-personality")).toContainText("12 of 12 answered");
    await expect(screen.getByTestId("own-row-safety")).toContainText("2 of 5 answered");
    await expect(screen.getByTestId("own-row-foods-to-avoid")).toContainText("chicken, grapes");
    await expect(screen.getByText("Has snapped once")).toBeVisible();
    await expect(screen.getByText("Owner isn't sure (other animals)")).toBeVisible();

    // A row opens its screen; after one answer it comes back to the summary.
    await screen.getByTestId("own-row-name").click();
    await screen.getByTestId("own-name").fill("Pippa");
    await screen.getByTestId("own-next").click();
    await expect(screen.getByTestId("own-title")).toHaveText("Meet Pippa");

    await screen.getByTestId("own-save").click();
    await expect(page).toHaveURL(/\/owner$/);

    const pet = db.pets.find((p) => p.owner_id === OWNER.id)!;
    expect(pet).toMatchObject({ species: "dog", name: "Pippa", breed: "Maltese", weight_kg: 6.5, notes: "Loves the sofa." });
    expect(String(pet.birthdate)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(pet.profile).toMatchObject({ v: 1, coat: "white", safety: { s1: "once", s2: "unsure", s6: "listed" } });
    expect((pet.profile as { answers: Record<string, number> }).answers).toMatchObject({ d1: 4, d6: 4, d7: 2, d12: 2 });
    expect(db.pet_allergies.map((a) => a.allergen).sort()).toEqual(["chicken", "grapes"]);
    // The photos are added after the pet is saved, the cover first.
    expect(completed).toHaveLength(2);
    expect(completed[0]).toMatch(/pet-2$/);
    expect(completed[1]).toMatch(/pet-1$/);
    expect(db.owner_profiles.find((p) => p.id === OWNER.id)).toMatchObject({
      intro: "Hi, I am Robert.",
      home_address: "100 Queen St W, Toronto",
      home_lat: 43.6534,
      home_lng: -79.3841,
    });
    expect(db.owner_profiles.find((p) => p.id === OWNER.id)?.onboarded_at).not.toBeNull();
  });

  test("every question can be skipped, and a skipped answer is not a Not sure", async ({ page }) => {
    const db = await newOwner(page);
    await signIn(page, OWNER);
    const screen = app(page);
    await screen.getByTestId("own-species-cat").click();
    await screen.getByTestId("own-next").click();
    await screen.getByTestId("own-name").fill("Mochi");
    await screen.getByTestId("own-next").click();
    for (const id of ["photos", "voice", "breed", "coat", "age", "weight", "petIntro"]) {
      await expect(screen.getByTestId(`own-step-${id}`)).toBeVisible();
      await screen.getByTestId("own-skip").click();
    }
    await expect(screen.getByTestId("own-step-about")).toBeVisible();
    await expect(screen.getByTestId("own-sources")).toContainText("Feline Five");
    await screen.getByTestId("own-next").click();
    // Cat list: 10 chart questions, no dog-only wording.
    for (let i = 1; i <= 10; i++) {
      await expect(screen.getByTestId(`own-step-q:c${i}`)).toBeVisible();
      await screen.getByTestId("own-skip").click();
    }
    for (const key of ["s1", "s2", "s3", "s4", "s5"]) {
      await expect(screen.getByTestId(`own-step-s:${key}`)).toBeVisible();
      await screen.getByTestId("own-skip").click();
    }
    for (const id of ["foods", "ownerIntro", "location"]) {
      await expect(screen.getByTestId(`own-step-${id}`)).toBeVisible();
      await screen.getByTestId("own-skip").click();
    }
    await expect(screen.getByTestId("own-row-personality")).toContainText("0 of 10 answered");
    await expect(screen.getByTestId("own-row-home")).toContainText("Not shared yet");
    await expect(screen.getByTestId("own-row-breed")).toContainText("Not shared yet");
    await expect(screen.getByText("Owner isn't sure")).toHaveCount(0);
    await screen.getByTestId("own-save").click();
    await expect(page).toHaveURL(/\/owner$/);
    const pet = db.pets.find((p) => p.owner_id === OWNER.id)!;
    expect(pet).toMatchObject({ species: "cat", name: "Mochi", breed: null, birthdate: null, weight_kg: null, notes: null });
    expect(pet.profile).toEqual({ v: 1, answers: {}, safety: {} });
    // Nothing was written to the owner's own profile besides the done mark.
    expect(db.owner_profiles.find((p) => p.id === OWNER.id)).not.toHaveProperty("intro");
  });

  test("Back goes to the last screen, and a reload goes on where the owner was", async ({ page }) => {
    await newOwner(page);
    await signIn(page, OWNER);
    const screen = app(page);
    await screen.getByTestId("own-species-dog").click();
    await screen.getByTestId("own-next").click();
    await screen.getByTestId("own-name").fill("Pip");
    await screen.getByTestId("own-next").click();
    await expect(screen.getByTestId("own-step-photos")).toBeVisible();
    await screen.getByTestId("own-back-bottom").click(); // the Back link under the answers does the same as the arrow
    await expect(screen.getByTestId("own-name")).toHaveValue("Pip");
    await screen.getByTestId("own-next").click();
    await page.reload();
    await expect(screen.getByTestId("own-step-photos")).toBeVisible();
  });

  test("Add a pet later marks the owner done and goes home without a pet", async ({ page }) => {
    const db = await newOwner(page);
    await signIn(page, OWNER);
    await app(page).getByTestId("own-later").click();
    await expect(page).toHaveURL(/\/owner$/);
    expect(db.pets).toHaveLength(0);
    expect(db.owner_profiles.find((p) => p.id === OWNER.id)?.onboarded_at).not.toBeNull();
  });

  test("an owner who was here before is not sent to the questions", async ({ page }) => {
    await mockSupabase(page, [OWNER]);
    await signIn(page, OWNER);
    await expect(page).toHaveURL(/\/owner$/);
  });

  test("the current location sets a pin without an address, and a denied browser says so", async ({ page }) => {
    const db = await newOwner(page);
    await page.addInitScript(() => {
      let calls = 0;
      Object.defineProperty(navigator, "geolocation", {
        configurable: true,
        value: {
          getCurrentPosition(ok: (p: unknown) => void, fail: (e: unknown) => void) {
            calls += 1;
            if (calls === 1) fail({ code: 1 });
            else ok({ coords: { latitude: 43.6477, longitude: -79.4194 } });
          },
          watchPosition: () => 1,
          clearWatch: () => undefined,
        },
      });
    });
    await signIn(page, OWNER);
    const screen = app(page);
    await screen.getByTestId("own-species-dog").click();
    await screen.getByTestId("own-next").click();
    await screen.getByTestId("own-name").fill("Pip");
    await screen.getByTestId("own-next").click();
    for (const id of ["photos", "voice", "breed", "coat", "age", "weight", "petIntro"]) await screen.getByTestId("own-skip").click();
    await screen.getByTestId("own-next").click(); // where the questions come from
    await expect(screen.getByTestId("own-step-q:d1")).toBeVisible();
    for (let i = 0; i < 12 + 5 + 2; i++) await screen.getByTestId("own-skip").click();
    await expect(screen.getByTestId("own-step-location")).toBeVisible();
    await screen.getByTestId("own-use-location").click();
    await expect(screen.getByText("Location is off for Goldito in this browser")).toBeVisible();
    await screen.getByTestId("own-use-location").click();
    await expect(screen.getByTestId("own-pin-ok")).toBeVisible();
    await expect(screen.getByText("No address found here. The pin is kept.")).toBeVisible();
    await screen.getByTestId("own-next").click();
    await expect(screen.getByTestId("own-row-home")).toContainText("Pin set");
    await screen.getByTestId("own-save").click();
    await expect(page).toHaveURL(/\/owner$/);
    expect(db.owner_profiles.find((p) => p.id === OWNER.id)).toMatchObject({ home_lat: 43.6477, home_lng: -79.4194 });
    expect(db.owner_profiles.find((p) => p.id === OWNER.id)?.home_address).toBeNull();
  });

  test("the current location fills the address field (#284)", async ({ page }) => {
    const db = await newOwner(page);
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "geolocation", {
        configurable: true,
        value: {
          getCurrentPosition(ok: (p: unknown) => void) {
            ok({ coords: { latitude: 43.6477, longitude: -79.4194 } });
          },
          watchPosition: () => 1,
          clearWatch: () => undefined,
        },
      });
    });
    await page.route("**/api/geo/reverse", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ found: true, label: "Trinity Bellwoods, Toronto", postal: "M6J", address: "Dundas St W, Toronto, M6J" }),
      }),
    );
    await signIn(page, OWNER);
    const screen = app(page);
    await screen.getByTestId("own-species-dog").click();
    await screen.getByTestId("own-next").click();
    await screen.getByTestId("own-name").fill("Pip");
    await screen.getByTestId("own-next").click();
    for (const id of ["photos", "voice", "breed", "coat", "age", "weight", "petIntro"]) await screen.getByTestId("own-skip").click();
    await screen.getByTestId("own-next").click();
    await expect(screen.getByTestId("own-step-q:d1")).toBeVisible();
    for (let i = 0; i < 12 + 5 + 2; i++) await screen.getByTestId("own-skip").click();
    await expect(screen.getByTestId("own-step-location")).toBeVisible();
    await screen.getByTestId("own-use-location").click();
    await expect(screen.getByTestId("own-address")).toHaveValue("Dundas St W, Toronto, M6J");
    await expect(screen.getByTestId("own-pin-ok")).toHaveCount(0);
    await screen.getByTestId("own-next").click();
    await expect(screen.getByTestId("own-row-home")).toContainText("Dundas St W, Toronto");
    await screen.getByTestId("own-save").click();
    await expect(page).toHaveURL(/\/owner$/);
    expect(db.owner_profiles.find((p) => p.id === OWNER.id)).toMatchObject({
      home_lat: 43.6477,
      home_lng: -79.4194,
      home_address: "Dundas St W, Toronto, M6J",
    });
  });

  test("voice: the recording becomes text the owner fixes, facts are suggested, and safety answers are never picked for them", async ({ page }) => {
    const db = await newOwner(page);
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "mediaDevices", {
        configurable: true,
        value: { getUserMedia: async () => ({ getTracks: () => [{ stop: () => undefined }] }) },
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
          this.ondataavailable?.({ data: new Blob([new Uint8Array(2000)], { type: "audio/webm" }) });
          this.onstop?.();
        }
      }
      (window as unknown as { MediaRecorder: unknown }).MediaRecorder = FakeRecorder;
    });
    const json = (body: unknown, status = 200) => ({ status, contentType: "application/json", body: JSON.stringify(body) });
    let recordingType: string | null = null;
    let asked: { transcript: string; species: string; questions: { key: string }[] } | null = null;
    await page.route("**/api/ai/pet-voice/transcribe", (route) => {
      recordingType = route.request().headers()["content-type"] ?? null;
      return route.fulfill(json({ transcript: "Pip is a 4 year old Maltese, about 13 pounds, allergic to chicken." }));
    });
    await page.route("**/api/ai/pet-voice", (route) => {
      asked = route.request().postDataJSON();
      return route.fulfill(
        json({
          breed: { value: "Maltese", quote: "4 year old Maltese" },
          age_years: { value: 4, quote: "4 year old" },
          weight_kg: { value: 5.9, quote: "13 pounds" },
          foods: [{ value: "chicken", quote: "allergic to chicken" }],
          answers: { d4: { value: "3", quote: "gets nervous with thunder" }, s1: { value: "once", quote: "once snapped at a groomer" } },
          model: "nano",
          latency_ms: 300,
        }),
      );
    });
    await signIn(page, OWNER);
    const screen = app(page);
    await screen.getByTestId("own-species-dog").click();
    await screen.getByTestId("own-next").click();
    await screen.getByTestId("own-name").fill("Pip");
    await screen.getByTestId("own-next").click();
    await screen.getByTestId("own-skip").click(); // photos

    await expect(screen.getByTestId("own-title")).toHaveText("Tell us about Pip");
    await expect(screen.getByTestId("own-mic-status")).toHaveText("Tap to talk");
    await expect(screen.getByText("We don't keep the recording.")).toBeVisible();
    await screen.getByTestId("own-mic").click();
    await expect(screen.getByTestId("own-mic-status")).toContainText("of 1:00");
    await screen.getByTestId("own-mic").click();
    // The words are shown and can be fixed before anything is read from them.
    await expect(screen.getByTestId("own-voice-text")).toHaveValue("Pip is a 4 year old Maltese, about 13 pounds, allergic to chicken.");
    expect(recordingType).toBe("audio/webm");
    await screen.getByTestId("own-voice-text").fill("Pip is a 4 year old Maltese, about 13 pounds, allergic to chicken. He gets nervous with thunder.");
    await screen.getByTestId("own-voice-use").click();

    // Facts fill the empty fields and show the words they came from.
    await expect(screen.getByTestId("own-breed")).toHaveValue("Maltese");
    expect(asked!.transcript).toContain("gets nervous with thunder");
    expect(asked!.species).toBe("dog");
    expect(asked!.questions.map((q) => q.key)).toEqual(expect.arrayContaining(["d1", "d12", "s1", "s5"]));
    await expect(screen.getByTestId("own-heard-breed")).toContainText("4 year old Maltese");
    await screen.getByTestId("own-next").click();
    await screen.getByTestId("own-skip").click(); // color
    await expect(screen.getByTestId("own-age-value")).toHaveText("4 years");
    await screen.getByTestId("own-next").click();
    await expect(screen.getByTestId("own-weight")).toHaveValue("5.9");
    await screen.getByTestId("own-next").click();
    await screen.getByTestId("own-skip").click(); // about the pet
    await screen.getByTestId("own-next").click(); // where the questions come from

    // A chart answer arrives chosen and marked, and Next keeps it.
    await expect(screen.getByTestId("own-step-q:d1")).toBeVisible();
    await screen.getByTestId("own-skip").click();
    for (const key of ["d2", "d3"]) {
      await expect(screen.getByTestId(`own-step-q:${key}`)).toBeVisible();
      await screen.getByTestId("own-skip").click();
    }
    await expect(screen.getByTestId("own-step-q:d4")).toBeVisible();
    await expect(screen.getByTestId("own-opt-3")).toContainText("✨ suggested");
    await expect(screen.getByTestId("own-heard-q")).toContainText("gets nervous with thunder");
    await screen.getByTestId("own-next").click();
    for (let i = 5; i <= 12; i++) {
      await expect(screen.getByTestId(`own-step-q:d${i}`)).toBeVisible();
      await screen.getByTestId("own-skip").click();
    }

    // A safety answer is only shown: nothing is selected until the owner taps.
    await expect(screen.getByTestId("own-step-s:s1")).toBeVisible();
    await expect(screen.getByTestId("own-heard-safety")).toContainText("We heard");
    await expect(screen.getByTestId("own-safe-once")).toContainText("✨ suggested");
    await expect(screen.getByTestId("own-safe-once")).not.toHaveAttribute("aria-pressed", "true");
    await screen.getByTestId("own-safe-once").click();
    for (const key of ["s2", "s3", "s4", "s5"]) {
      await expect(screen.getByTestId(`own-step-s:${key}`)).toBeVisible();
      await screen.getByTestId("own-skip").click();
    }
    // The food it heard is a chip to tap, not added.
    await expect(screen.getByTestId("own-step-foods")).toBeVisible();
    await expect(screen.getByTestId("own-food-chicken")).toContainText("✨ suggested");
    await expect(screen.getByTestId("own-food-chicken")).not.toHaveAttribute("aria-pressed", "true");
    await expect(screen.getByTestId("own-next")).toBeDisabled();
    await screen.getByTestId("own-food-chicken").click();
    await screen.getByTestId("own-next").click();
    for (const id of ["ownerIntro", "location"]) {
      await expect(screen.getByTestId(`own-step-${id}`)).toBeVisible();
      await screen.getByTestId("own-skip").click();
    }
    await screen.getByTestId("own-save").click();
    await expect(page).toHaveURL(/\/owner$/);
    const pet = db.pets.find((p) => p.owner_id === OWNER.id)!;
    expect(pet).toMatchObject({ breed: "Maltese", weight_kg: 5.9 });
    expect(pet.profile).toMatchObject({ safety: { s1: "once", s6: "listed" } });
    expect((pet.profile as { answers: Record<string, number> }).answers).toEqual({ d4: 3 });
    expect(db.pet_allergies.map((a) => a.allergen)).toEqual(["chicken"]);
  });

  test("voice: a failed reading says so and the owner can answer the questions themselves", async ({ page }) => {
    await newOwner(page);
    // A browser that cannot record.
    await page.addInitScript(() => {
      (window as unknown as { MediaRecorder?: unknown }).MediaRecorder = undefined;
    });
    await page.route("**/api/ai/pet-voice", (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ detail: "We couldn't read that just now. You can answer the questions yourself." }),
      }),
    );
    await signIn(page, OWNER);
    const screen = app(page);
    await screen.getByTestId("own-species-cat").click();
    await screen.getByTestId("own-next").click();
    await screen.getByTestId("own-name").fill("Mochi");
    await screen.getByTestId("own-next").click();
    await screen.getByTestId("own-skip").click();
    // No microphone here: only typing is offered.
    await expect(screen.getByTestId("own-mic")).toHaveCount(0);
    await screen.getByTestId("own-voice-text").fill("Mochi hides from visitors.");
    await screen.getByTestId("own-voice-use").click();
    await expect(screen.getByTestId("own-voice-error")).toContainText("answer the questions yourself");
    await screen.getByTestId("own-skip").click();
    await expect(screen.getByTestId("own-step-breed")).toBeVisible();
  });

  test("photo: the cover photo is looked at in the background and its breed and color guesses are offered, not chosen", async ({ page }) => {
    await newOwner(page);
    await mockPetPhotos(page);
    let asked: { public_id: string; species: string } | null = null;
    await page.route("**/api/ai/pet-photo", (route) => {
      asked = route.request().postDataJSON();
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ species_match: true, breeds: ["Maltese", "Poodle mix"], coat_color: "white", model: "m", latency_ms: 900 }),
      });
    });
    await signIn(page, OWNER);
    const screen = app(page);
    await screen.getByTestId("own-species-dog").click();
    await screen.getByTestId("own-next").click();
    await screen.getByTestId("own-name").fill("Pip");
    await screen.getByTestId("own-next").click();
    await addPhoto(page, "mood_tug");
    await screen.getByTestId("own-next").click();
    await screen.getByTestId("own-skip").click(); // voice

    await expect(screen.getByTestId("own-breed-guess-1")).toContainText("Maltese?");
    await expect(screen.getByTestId("own-breed-guess-1")).toContainText("✨ suggested");
    await expect(screen.getByTestId("own-breed")).toHaveValue("");
    expect(asked!.species).toBe("dog");
    expect(asked!.public_id).toContain(`goldito/pet-profile/${OWNER.id}/`);
    await screen.getByTestId("own-breed-guess-2").click();

    await expect(screen.getByTestId("own-title")).toHaveText("What color is Pip?");
    await expect(screen.getByTestId("own-coat-white")).toContainText("✨ suggested");
    await expect(screen.getByTestId("own-coat-white")).not.toHaveAttribute("aria-pressed", "true");
    await screen.getByTestId("own-coat-cream").click();
    for (const id of ["age", "weight", "petIntro"]) {
      await expect(screen.getByTestId(`own-step-${id}`)).toBeVisible();
      await screen.getByTestId("own-skip").click();
    }
    await page.reload();
    // Everything the owner picked survives a reload; the guess itself is not asked for again.
    await expect(screen.getByTestId("own-step-about")).toBeVisible();
    for (let i = 0; i < 5; i++) await screen.getByTestId("own-back").click(); // about the pet, weight, age, color, breed
    await expect(screen.getByTestId("own-breed")).toHaveValue("Poodle mix");
  });

  test("photo: another animal or a failed guess offers nothing and the flow goes on", async ({ page }) => {
    await newOwner(page);
    await mockPetPhotos(page);
    await page.route("**/api/ai/pet-photo", (route) => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ detail: "down" }) }));
    await signIn(page, OWNER);
    const screen = app(page);
    await screen.getByTestId("own-species-cat").click();
    await screen.getByTestId("own-next").click();
    await screen.getByTestId("own-name").fill("Mochi");
    await screen.getByTestId("own-next").click();
    await addPhoto(page, "mood_grass");
    await screen.getByTestId("own-next").click();
    await screen.getByTestId("own-skip").click();
    await expect(screen.getByTestId("own-step-breed")).toBeVisible();
    await expect(screen.getByTestId("own-breed-guesses")).toHaveCount(0);
    await screen.getByTestId("own-skip").click();
    await expect(screen.getByTestId("own-coat-white")).not.toContainText("suggested");
  });

  test("a dog and a cat: the questions run once per pet and the owner is done after the last", async ({ page }) => {
    const db = await newOwner(page);
    await signIn(page, OWNER);
    const screen = app(page);
    const next = screen.getByTestId("own-next");

    // Both kinds can be ticked; Next waits for one, and a second tap unticks.
    await expect(next).toBeDisabled();
    await screen.getByTestId("own-species-cat").click();
    await screen.getByTestId("own-species-cat").click();
    await expect(next).toBeDisabled();
    await screen.getByTestId("own-species-cat").click();
    await screen.getByTestId("own-species-dog").click();
    await expect(screen.getByTestId("own-species-dog")).toHaveAttribute("aria-pressed", "true");
    await expect(screen.getByTestId("own-species-cat")).toHaveAttribute("aria-pressed", "true");
    await next.click();

    // The dog goes first and the question says which pet it is about. Everything else is skipped.
    await expect(screen.getByTestId("own-title")).toHaveText("What's your dog's name?");
    await screen.getByTestId("own-name").fill("Pip");
    await next.click();
    await skipToSummary(page);
    await expect(screen.getByTestId("own-title")).toHaveText("Meet Pip");
    await expect(screen.getByTestId("own-row-about-you")).toBeVisible();
    await expect(screen.getByTestId("own-row-home")).toBeVisible();
    await screen.getByTestId("own-save").click();

    // The cat starts from its name: no kind question, nothing about the owner again, and the owner is not done yet.
    await expect(screen.getByTestId("own-title")).toHaveText("What's your cat's name?");
    await expect(screen.getByTestId("own-back")).toHaveCount(0);
    await expect(screen.getByTestId("own-back-bottom")).toHaveCount(0);
    expect(db.pets.map((p) => p.name)).toEqual(["Pip"]);
    expect(db.owner_profiles.find((p) => p.id === OWNER.id)?.onboarded_at).toBeNull();
    await screen.getByTestId("own-name").fill("Mochi");
    await next.click();
    await skipToSummary(page);
    await expect(screen.getByTestId("own-title")).toHaveText("Meet Mochi");
    await expect(screen.getByTestId("own-row-about-you")).toHaveCount(0);
    await expect(screen.getByTestId("own-row-home")).toHaveCount(0);
    await expect(screen.getByTestId("own-row-personality")).toContainText("0 of 10 answered");
    await screen.getByTestId("own-save").click();

    await expect(page).toHaveURL(/\/owner$/);
    expect(db.pets.map((p) => [p.name, p.species])).toEqual([["Pip", "dog"], ["Mochi", "cat"]]);
    expect(db.owner_profiles.find((p) => p.id === OWNER.id)?.onboarded_at).not.toBeNull();
  });

  test("the weight can be typed in kg or lbs, the switch converts it and the pet is saved in kg", async ({ page }) => {
    const db = await newOwner(page);
    await signIn(page, OWNER);
    const screen = app(page);
    await screen.getByTestId("own-species-dog").click();
    await screen.getByTestId("own-next").click();
    await screen.getByTestId("own-name").fill("Pip");
    await screen.getByTestId("own-next").click();
    for (const step of ["photos", "voice", "breed", "coat", "age"]) {
      await expect(screen.getByTestId(`own-step-${step}`)).toBeVisible();
      await screen.getByTestId("own-skip").click();
    }

    await expect(screen.getByTestId("own-title")).toHaveText("How much does Pip weigh?");
    await expect(screen.getByTestId("own-weight-unit-kg")).toHaveAttribute("aria-checked", "true");
    await expect(screen.getByTestId("own-weight")).toHaveAttribute("placeholder", "kg");
    await expect(screen.getByTestId("own-next")).toBeDisabled();
    await screen.getByTestId("own-weight").fill("6,8");
    await screen.getByTestId("own-weight-unit-lbs").click();
    await expect(screen.getByTestId("own-weight-unit-lbs")).toHaveAttribute("aria-checked", "true");
    await expect(screen.getByTestId("own-weight")).toHaveValue("15");
    await screen.getByTestId("own-weight-unit-kg").click();
    await expect(screen.getByTestId("own-weight")).toHaveValue("6.8");
    await screen.getByTestId("own-weight-unit-lbs").click();
    await screen.getByTestId("own-weight").fill("22.5");
    await screen.getByTestId("own-next").click();
    await skipToSummary(page);

    await expect(screen.getByTestId("own-row-weight")).toContainText("22.5 lbs");
    await expect(screen.getByTestId("own-glance")).toContainText("10.21 kg");
    await screen.getByTestId("own-save").click();
    await expect(page).toHaveURL(/\/owner$/);
    expect(db.pets.find((p) => p.name === "Pip")).toMatchObject({ weight_kg: 10.21 });
  });

  test("a reload while the second pet is open goes on with that pet", async ({ page }) => {
    const db = await newOwner(page);
    await signIn(page, OWNER);
    const screen = app(page);
    await screen.getByTestId("own-species-dog").click();
    await screen.getByTestId("own-species-cat").click();
    await screen.getByTestId("own-next").click();
    await screen.getByTestId("own-name").fill("Pip");
    await screen.getByTestId("own-next").click();
    await skipToSummary(page);
    await screen.getByTestId("own-save").click();
    await expect(screen.getByTestId("own-title")).toHaveText("What's your cat's name?");

    await page.reload();
    await expect(page).toHaveURL(/\/owner-onboarding$/);
    await expect(app(page).getByTestId("own-title")).toHaveText("What's your cat's name?");
    expect(db.pets).toHaveLength(1);
  });

  test("skipping all questions from the about screen jumps straight to summary", async ({ page }) => {
    await newOwner(page);
    await signIn(page, OWNER);
    const screen = app(page);
    await screen.getByTestId("own-species-dog").click();
    await screen.getByTestId("own-next").click();
    await screen.getByTestId("own-name").fill("Pip");
    await screen.getByTestId("own-next").click();
    for (const step of ["photos", "voice", "breed", "coat", "age", "weight", "petIntro"]) {
      await expect(screen.getByTestId(`own-step-${step}`)).toBeVisible();
      await screen.getByTestId("own-skip").click();
    }
    await expect(screen.getByTestId("own-step-about")).toBeVisible();
    await expect(screen.getByTestId("own-skip-all")).toBeVisible();
    await expect(screen.getByTestId("own-skip-questions")).toBeVisible();
    await screen.getByTestId("own-skip-questions").click();
    await expect(screen.getByTestId("own-step-summary")).toBeVisible();
  });

  test("skip all button in the header corner skips remaining questions to summary", async ({ page }) => {
    await newOwner(page);
    await signIn(page, OWNER);
    const screen = app(page);
    await screen.getByTestId("own-species-dog").click();
    await screen.getByTestId("own-next").click();
    await screen.getByTestId("own-name").fill("Pip");
    await screen.getByTestId("own-next").click();
    for (const step of ["photos", "voice", "breed", "coat", "age", "weight", "petIntro"]) {
      await expect(screen.getByTestId(`own-step-${step}`)).toBeVisible();
      await screen.getByTestId("own-skip").click();
    }
    await expect(screen.getByTestId("own-step-about")).toBeVisible();
    await screen.getByTestId("own-next").click();
    // Now on first question step
    await expect(screen.getByTestId("own-skip-all")).toBeVisible();
    await screen.getByTestId("own-skip-all").click();
    await expect(screen.getByTestId("own-step-summary")).toBeVisible();
  });
});
