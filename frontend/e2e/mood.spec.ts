import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { caring } from "./careFixtures";
import { APP_FRAME, app, box, isInside, signIn } from "./helpers";
import { MockDb, MockUser, OWNER, SITTER, mockSupabase } from "./supabaseMock";

// Snap → Mood (Phase 12.2b, D61): pick a photo or clip → boxes per pet (MediaPipe in the browser) → crops to
// POST /api/ai/pet-mood → a box per pet and an eight-emotion table. The detector is replaced by a test hook
// (`window.__goldiVision`) so the spec never downloads MediaPipe; the API is mocked (pytest covers the real one).

const MAX = "00000000-0000-4000-8000-0000000000aa";
const MOCHI = "00000000-0000-4000-8000-0000000000bb";

type HookBox = { x: number; y: number; w: number; h: number; label: "dog" | "cat"; score: number };
const LEFT: HookBox = { x: 0.05, y: 0.3, w: 0.4, h: 0.5, label: "dog", score: 0.9 };
const RIGHT: HookBox = { x: 0.55, y: 0.25, w: 0.4, h: 0.6, label: "dog", score: 0.8 };

const ZERO = { happy: 0, relaxed: 0, excited: 0, curious: 0, sleepy: 0, anxious: 0, angry: 0, sad: 0 };
function mood(top: keyof typeof ZERO, extra: object = {}) {
  const emotions = { ...ZERO, [top]: 60, ...(top === "happy" ? { relaxed: 40 } : { happy: 40 }) };
  const { x, y, w, h } = LEFT;
  return { frame: 0, box: { x, y, w, h }, emotions, top, summary: `This pup seems ${top}.`, frames_used: 1, ...extra };
}
const DISCLAIMER = "For fun only, not a health check.";

type Reply = { status: number; body: object };

async function open(
  page: Page,
  user: MockUser,
  options: { boxes: HookBox[]; replies?: Reply[]; clipFrames?: number; seed?: (db: MockDb) => void },
) {
  // Before any navigation: the app reads the hook when it looks for pets.
  await page.addInitScript(
    ({ boxes, clipFrames }) => {
      const hooks: Record<string, unknown> = { detectPets: () => boxes.map((b) => ({ ...b })) };
      if (clipFrames) {
        hooks.loadFrames = () =>
          Array.from({ length: clipFrames }, (_, i) => {
            const canvas = document.createElement("canvas");
            canvas.width = 400;
            canvas.height = 300;
            const g = canvas.getContext("2d")!;
            g.fillStyle = `hsl(${i * 80}, 60%, 60%)`;
            g.fillRect(0, 0, 400, 300);
            return canvas;
          });
      }
      (window as unknown as { __goldiVision: unknown }).__goldiVision = hooks;
    },
    { boxes: options.boxes, clipFrames: options.clipFrames ?? 0 },
  );
  const { db } = await mockSupabase(page, [OWNER, SITTER]);
  options.seed?.(db);
  const asked: Record<string, any>[] = [];
  const replies = options.replies ?? [];
  await page.route("**/api/ai/pet-mood", (route) => {
    asked.push(route.request().postDataJSON());
    const reply = replies[Math.min(asked.length - 1, replies.length - 1)];
    return route.fulfill({ status: reply.status, contentType: "application/json", body: JSON.stringify(reply.body) });
  });
  await signIn(page, user);
  await expect(page).toHaveURL(user.role === "owner" ? /\/owner$/ : /\/sitter$/);
  await page.goto(`/${user.role}/snap/mood`);
  await app(page).getByTestId("mood-pick").waitFor();
  return { db, asked };
}

function ownerPets(db: MockDb) {
  db.pets.push({ id: MAX, owner_id: OWNER.id, species: "dog", name: "Max", breed: null, notes: null });
  db.pets.push({ id: MOCHI, owner_id: OWNER.id, species: "cat", name: "Mochi", breed: null, notes: null });
}

async function pick(page: Page, sample: string) {
  const screen = app(page);
  await screen.getByTestId("mood-pick").click();
  await screen.getByTestId(`sample-${sample}`).click();
}

test.describe("snap mood", () => {
  test("two dogs in a photo: a box each, left to right, and a table per dog — all by mouse", async ({ page }) => {
    const two = {
      pets: [mood("excited", { summary: "This pup looks excited to play." }), mood("sleepy", { box: { x: 0.55, y: 0.25, w: 0.4, h: 0.6 } })],
      disclaimer: DISCLAIMER,
    };
    const { asked } = await open(page, OWNER, { boxes: [RIGHT, LEFT], replies: [{ status: 200, body: two }], seed: ownerPets });
    const screen = app(page);
    await expect(screen.getByTestId("mood-disclaimer")).toHaveText(DISCLAIMER); // before anything is picked, too

    await pick(page, "mood_tug");
    await expect(screen.getByTestId("mood-result")).toBeVisible();

    // The crops go left to right, as JPEG data URLs; no pet was named (Max and Mochi, none picked).
    expect(asked).toHaveLength(1);
    expect(asked[0].pet_id).toBeUndefined();
    expect(asked[0].frames).toHaveLength(1);
    const crops = asked[0].frames[0].crops;
    expect(crops.map((c: { box: { x: number } }) => c.box.x)).toEqual([0.05, 0.55]);
    for (const c of crops) expect(c.image).toMatch(/^data:image\/jpeg;base64,/);

    await expect(screen.getByTestId("mood-box-0")).toBeVisible();
    await expect(screen.getByTestId("mood-box-1")).toBeVisible();
    expect(isInside(await box(screen.getByTestId("mood-box-1")), await box(screen.getByTestId("mood-image")))).toBe(true);
    // The picture with its boxes sits inside the phone frame (the table below it scrolls).
    expect(isInside(await box(screen.getByTestId("mood-image")), await box(page.locator(APP_FRAME)))).toBe(true);
    await expect(screen.getByTestId("mood-summary")).toHaveText("This pup looks excited to play.");
    await expect(screen.getByTestId("mood-face")).toHaveAttribute("aria-label", "Pet 1 looks excited");
    // The answer first: the top three bars, the rest behind See all.
    await expect(screen.locator('[data-testid^="mood-row-"]')).toHaveCount(3);
    await expect(screen.getByTestId("mood-value-excited")).toHaveText("60%");
    await screen.getByTestId("mood-more").click();
    await expect(screen.locator('[data-testid^="mood-row-"]')).toHaveCount(8);

    // Click the other dog's box → its table; the tab brings the first back.
    await screen.getByTestId("mood-box-1").click();
    await expect(screen.getByTestId("mood-summary")).toHaveText("This pup seems sleepy.");
    await expect(screen.getByTestId("mood-value-sleepy")).toHaveText("60%");
    await screen.getByTestId("mood-pet-0").click();
    await expect(screen.getByTestId("mood-summary")).toHaveText("This pup looks excited to play.");
    await expect(screen.getByTestId("mood-disclaimer")).toHaveText(DISCLAIMER);
  });

  test("a sitter's one pet in care is named, so the line can use its name", async ({ page }) => {
    const one = { pets: [mood("happy", { summary: "Max seems happy and a little relaxed." })], disclaimer: DISCLAIMER };
    const { asked } = await open(page, SITTER, {
      boxes: [LEFT],
      replies: [{ status: 200, body: one }],
      seed: (db) => caring(db, [{ id: MAX, name: "Max", species: "dog" }]),
    });
    const screen = app(page);
    await expect(screen.getByTestId(`mood-pet-id-${MAX}`)).toHaveAttribute("aria-selected", "true");
    await pick(page, "mood_tongue");
    await expect(screen.getByTestId("mood-summary")).toHaveText("Max seems happy and a little relaxed.");
    expect(asked[0].pet_id).toBe(MAX);
    await expect(screen.getByTestId("mood-face")).toHaveAttribute("aria-label", "Max looks happy");
    // One pet: the photo is a thumbnail beside the answer; a tap shows it with its box.
    await expect(screen.getByTestId("mood-box-0")).toHaveCount(0);
    await screen.getByTestId("mood-photo").click();
    await expect(screen.getByTestId("mood-box-0")).toContainText("Max");
  });

  test("no pet in the picture is said in the app, and the server's 422 says the same", async ({ page }) => {
    const { asked } = await open(page, OWNER, { boxes: [], seed: ownerPets });
    const screen = app(page);
    await pick(page, "mood_grass");
    await expect(screen.getByTestId("mood-no-pet")).toHaveText("We couldn't find a pet. Try a clearer photo.");
    expect(asked).toHaveLength(0);
    await expect(screen.getByTestId("mood-pick")).toContainText("Try another photo");
  });

  test("the server finding no pet in the crops shows the same line", async ({ page }) => {
    await open(page, OWNER, {
      boxes: [LEFT],
      replies: [{ status: 422, body: { detail: "We couldn't find a pet. Try a clearer photo." } }],
      seed: ownerPets,
    });
    await pick(page, "mood_grass");
    await expect(app(page).getByTestId("mood-no-pet")).toBeVisible();
  });

  test("a clip sends four frames and shows the average with the most typical frame", async ({ page }) => {
    const clip = { pets: [mood("excited", { frame: 2, frames_used: 4 })], disclaimer: DISCLAIMER };
    const { asked } = await open(page, OWNER, { boxes: [LEFT], clipFrames: 4, replies: [{ status: 200, body: clip }], seed: ownerPets });
    const screen = app(page);
    await pick(page, "play_fetch");
    await expect(screen.getByTestId("mood-frames")).toHaveText("Average of 4 frames from the clip");
    expect(asked[0].frames.map((f: { index: number }) => f.index)).toEqual([0, 1, 2, 3]);
    expect(asked[0].frames.every((f: { crops: unknown[] }) => f.crops.length === 1)).toBe(true);
  });

  test("the model down offers Try again with the same crops", async ({ page }) => {
    const { asked } = await open(page, OWNER, {
      boxes: [LEFT],
      replies: [
        { status: 503, body: { detail: "Couldn't read the mood right now. Try again in a moment." } },
        { status: 200, body: { pets: [mood("happy")], disclaimer: DISCLAIMER } },
      ],
      seed: ownerPets,
    });
    const screen = app(page);
    await pick(page, "mood_tug");
    await expect(screen.getByTestId("error-dialog-message")).toContainText("Try again in a moment");
    await screen.getByTestId("error-dialog-retry").click();
    await expect(screen.getByTestId("mood-summary")).toHaveText("This pup seems happy.");
    expect(asked).toHaveLength(2);
    expect(asked[1]).toEqual(asked[0]);
  });
});
