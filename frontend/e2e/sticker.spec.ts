import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { caring, mockUpload } from "./careFixtures";
import { app, signIn } from "./helpers";
import { MockDb, MockUser, OWNER, SITTER, mockSupabase } from "./supabaseMock";

// Snap → Sticker (Phase 12.3a, D61): pick a photo → the biggest pet is cut out under its centre → tap elsewhere to
// cut again → Save sticker uploads only the transparent PNG and adds it to the pet's sticker box (both people see
// it, only the maker deletes it). MediaPipe is replaced by test hooks (`window.__goldiVision`): a fixed box and an
// elliptic mask around the tapped point; the sticker itself is drawn by the app's real canvas code.

const MAX = "00000000-0000-4000-8000-0000000000aa";
const BOX = { x: 0.2, y: 0.2, w: 0.5, h: 0.6, label: "dog", score: 0.9 };

type Point = { x: number; y: number };

async function open(page: Page, user: MockUser, options: { seed: (db: MockDb) => void; emptyMask?: boolean }) {
  const taps: Point[] = [];
  await page.exposeFunction("__recordTap", (point: Point) => taps.push(point));
  await page.addInitScript(
    ({ box, emptyMask }) => {
      (window as unknown as { __goldiVision: unknown }).__goldiVision = {
        detectPets: () => [{ ...box }],
        segmentAt: (_frame: HTMLCanvasElement, point: { x: number; y: number }) => {
          (window as unknown as { __recordTap: (p: unknown) => void }).__recordTap(point);
          const width = 200;
          const height = 150;
          const data = new Float32Array(width * height);
          if (!emptyMask) {
            for (let y = 0; y < height; y++) {
              for (let x = 0; x < width; x++) {
                const dx = (x / width - point.x) / 0.15;
                const dy = (y / height - point.y) / 0.2;
                data[y * width + x] = dx * dx + dy * dy <= 1 ? 1 : 0;
              }
            }
          }
          return { width, height, data };
        },
      };
    },
    { box: BOX, emptyMask: !!options.emptyMask },
  );
  const { db } = await mockSupabase(page, [OWNER, SITTER]);
  options.seed(db);
  const signed = await mockUpload(page, db, MAX);
  const uploads: { body: string }[] = [];
  // Read the multipart body, then let mockUpload's handler answer.
  await page.route("**/cloudinary-mock/**", (route) => {
    uploads.push({ body: route.request().postDataBuffer()?.toString("latin1") ?? "" });
    return route.fallback();
  });
  await signIn(page, user);
  await expect(page).toHaveURL(user.role === "owner" ? /\/owner$/ : /\/sitter$/);
  await page.goto(`/${user.role}/snap/sticker`);
  return { db, taps, signed, uploads };
}

function max(db: MockDb) {
  db.pets.push({ id: MAX, owner_id: OWNER.id, species: "dog", name: "Max", breed: null, notes: null });
}

test.describe("snap sticker", () => {
  test("owner: the pet is cut out, a tap cuts again, and Save puts only the PNG in Max's sticker box", async ({ page }) => {
    const { db, taps, signed, uploads } = await open(page, OWNER, { seed: max });
    const screen = app(page);
    await expect(screen.getByTestId(`sticker-pet-${MAX}`)).toHaveAttribute("aria-pressed", "true"); // the only pet
    await expect(screen.getByTestId("sticker-box-empty")).toBeVisible();

    await screen.getByTestId("sticker-pick").click();
    await screen.getByTestId("sample-mood_tug").click();
    await expect(screen.getByTestId("sticker-preview")).toBeVisible();
    // First cut: the centre of the biggest box.
    expect(taps[0].x).toBeCloseTo(0.45, 2);
    expect(taps[0].y).toBeCloseTo(0.5, 2);

    // A tap on the photo cuts again at that spot (mouse click = tap).
    const photo = screen.getByTestId("sticker-photo");
    const size = (await photo.boundingBox())!;
    await photo.click({ position: { x: size.width * 0.3, y: size.height * 0.4 } });
    await expect.poll(() => taps.length).toBe(2);
    expect(taps[1].x).toBeCloseTo(0.3, 1);
    expect(taps[1].y).toBeCloseTo(0.4, 1);
    await expect(screen.getByTestId("sticker-preview")).toBeVisible();

    // The cut-out can be saved to the computer before (or without) saving it to the box.
    const download = page.waitForEvent("download");
    await screen.getByTestId("sticker-download").click();
    expect((await download).suggestedFilename()).toBe("goldito-max-sticker.png");

    await screen.getByTestId("sticker-save").click();
    await expect(screen.getByTestId("toast")).toContainText("Paw-fect! Saved to");
    expect(signed[0]).toMatchObject({ pet_id: MAX, purpose: "sticker", resource_type: "image" });
    // The cut-out PNG went up as it is — never re-encoded to a JPEG (that would paint the background white).
    expect(uploads[0].body).toContain('filename="sticker.png"');
    expect(uploads[0].body).toContain("Content-Type: image/png");
    expect(db.pet_stickers).toHaveLength(1);
    expect(db.pet_stickers[0]).toMatchObject({ pet_id: MAX, media_id: "media-proof", created_by: OWNER.id });
    await expect(screen.getByTestId("sticker-tile")).toHaveCount(1);

    // The maker deletes it, after a confirm.
    await screen.getByTestId("sticker-delete").click();
    await screen.getByTestId("sticker-delete-confirm").click();
    await expect(screen.getByTestId("sticker-tile")).toHaveCount(0);
    expect(db.pet_stickers).toHaveLength(0);
  });

  test("a cut that catches nothing asks for a tap on the pet and offers no Save", async ({ page }) => {
    await open(page, OWNER, { seed: max, emptyMask: true });
    const screen = app(page);
    await screen.getByTestId("sticker-pick").click();
    await screen.getByTestId("sample-mood_grass").click();
    await expect(screen.getByTestId("sticker-missed")).toHaveText("We couldn't cut out a pet there. Tap your pet.");
    await expect(screen.getByTestId("sticker-save")).toHaveCount(0);
    await expect(screen.getByTestId("sticker-photo")).toBeVisible();
  });

  test("the sitter sees the owner's sticker of the pet in care but cannot delete it", async ({ page }) => {
    await open(page, SITTER, {
      seed: (db) => {
        caring(db, [{ id: MAX, name: "Max", species: "dog" }]);
        db.media.push({ id: "m-own", pet_id: MAX, uploaded_by: OWNER.id, cloudinary_public_id: `goldito/${MAX}/sticker/x`, resource_type: "image", purpose: "sticker" });
        db.pet_stickers.push({ id: "s-1", pet_id: MAX, media_id: "m-own", created_by: OWNER.id, created_at: "2026-10-14T10:00:00Z" });
      },
    });
    const screen = app(page);
    await expect(screen.getByTestId("sticker-tile")).toHaveCount(1);
    await expect(screen.getByTestId("sticker-delete")).toHaveCount(0);
  });

  test("a sitter with no pet in care sees why", async ({ page }) => {
    await open(page, SITTER, { seed: () => undefined });
    await expect(app(page).getByTestId("sticker-no-pets")).toContainText("No pet in your care right now");
  });
});
