import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import path from "node:path";

import { app, box, center, drag, signIn } from "./helpers";
import { OWNER, SITTER, mockSupabase } from "./supabaseMock";

// pickMedia() (phase-04 4.7), mouse only inside the desktop phone frame: sample tray →
// upload, Upload from computer, video trim sheet, Retry. The backend and Cloudinary are mocked
// (the build points EXPO_PUBLIC_API_URL at the test server).

const PET_ID = "00000000-0000-4000-8000-0000000000aa";
const FIXTURES = path.join(__dirname, "fixtures");

type Calls = {
  sign: Record<string, unknown>[];
  upload: { contentType: string; body: string }[];
  complete: Record<string, unknown>[];
};

async function setup(page: Page, options: { failSignOnce?: boolean } = {}): Promise<Calls> {
  const { db } = await mockSupabase(page, [OWNER, SITTER]);
  db.pets.push({ id: PET_ID, owner_id: OWNER.id, species: "dog", name: "Max", breed: null, notes: null });

  const calls: Calls = { sign: [], upload: [], complete: [] };
  let failed = false;

  await page.route("**/api/media/sign", async (route) => {
    const body = route.request().postDataJSON();
    calls.sign.push(body);
    if (options.failSignOnce && !failed) {
      failed = true;
      return route.fulfill({ status: 502, contentType: "application/json", body: JSON.stringify({ detail: "Cloudinary is down." }) });
    }
    const video = body.resource_type === "video";
    const start = body.trim_start ?? 0;
    const length = body.trim_duration ?? 30;
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        cloud_name: "pawnote-test",
        api_key: "123",
        timestamp: 1_700_000_000,
        signature: "sig",
        folder: `pawnote/${body.pet_id}/${body.purpose}`,
        upload_url: `http://127.0.0.1:4173/cloudinary-mock/${body.resource_type}/upload`,
        transformation: video ? `so_${start},du_${length}/c_limit,w_1280,h_1280/q_auto` : "c_limit,w_2000/q_auto",
      }),
    });
  });

  await page.route("**/cloudinary-mock/**", (route) => {
    const request = route.request();
    calls.upload.push({
      contentType: (request.headers()["content-type"] ?? "").split(";")[0],
      body: request.postDataBuffer()?.toString("latin1") ?? "",
    });
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ public_id: `pawnote/${PET_ID}/feed/abc`, width: 1200, height: 900, duration: 12 }),
    });
  });

  await page.route("**/api/media/complete", (route) => {
    calls.complete.push(route.request().postDataJSON());
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        media_id: "11111111-1111-4111-8111-111111111111",
        public_id: `pawnote/${PET_ID}/feed/abc`,
        secure_url: "https://res.cloudinary.com/pawnote-test/image/upload/abc",
        thumb_url: "",
      }),
    });
  });

  await signIn(page, SITTER);
  await app(page).getByRole("heading", { name: "Home" }).waitFor();
  await page.goto("/sitter/dev-upload");
  await app(page).getByTestId("dev-pick-photo").waitFor();
  return calls;
}

test.describe("pickMedia", () => {
  test("a sample photo goes through the same upload pipe as a real one", async ({ page }) => {
    const calls = await setup(page);

    await app(page).getByTestId("dev-pick-photo").click();
    await expect(app(page).getByTestId("media-picker")).toBeVisible();
    // Four placeholder samples for a feed upload, each a plain click.
    for (const id of ["meal", "walk", "nap", "walk_squirrel"]) {
      await expect(app(page).getByTestId(`sample-${id}`)).toBeVisible();
    }
    await app(page).getByTestId("sample-walk").click();

    await expect(app(page).getByTestId("dev-done")).toBeVisible();
    await expect(app(page).getByTestId("media-picker")).toBeHidden();

    expect(calls.sign).toEqual([{ pet_id: PET_ID, resource_type: "image", purpose: "feed", booking_id: null }]);
    // The signed incoming transformation is sent back unchanged, with a normalized JPEG.
    expect(calls.upload).toHaveLength(1);
    expect(calls.upload[0].body).toContain('name="transformation"');
    expect(calls.upload[0].body).toContain("c_limit,w_2000/q_auto");
    expect(calls.upload[0].body).toContain('filename="walk.jpg"');
    expect(calls.upload[0].body).toContain("Content-Type: image/jpeg");
    expect(calls.complete).toHaveLength(1);
    expect(calls.complete[0]).toMatchObject({ pet_id: PET_ID, purpose: "feed", resource_type: "image" });
    await expect(app(page).getByTestId("dev-media-id")).toContainText("11111111-1111-4111-8111-111111111111");
  });

  test("Upload from computer resizes a big photo to a 2000 px long edge", async ({ page }) => {
    const calls = await setup(page);

    await app(page).getByTestId("dev-pick-photo").click();
    const chooser = page.waitForEvent("filechooser");
    await app(page).getByTestId("media-upload-computer").click();
    // A 4000 x 3000 PNG made in the browser (no big file in the repo).
    const png = await page.evaluate(async () => {
      const canvas = document.createElement("canvas");
      canvas.width = 4000;
      canvas.height = 3000;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#39c";
      ctx.fillRect(0, 0, 4000, 3000);
      const blob: Blob = await new Promise((resolve) => canvas.toBlob((b) => resolve(b!), "image/png"));
      return Array.from(new Uint8Array(await blob.arrayBuffer()));
    });
    await (await chooser).setFiles({ name: "big.png", mimeType: "image/png", buffer: Buffer.from(png) });

    await expect(app(page).getByTestId("dev-done")).toBeVisible();
    const sent = calls.upload[0];
    expect(sent.body).toContain('filename="big.jpg"');
    expect(sent.body).toContain("Content-Type: image/jpeg");
    // Re-encoded JPEG: far smaller than the 4000 px original.
    expect(Buffer.byteLength(sent.body, "latin1")).toBeLessThan(png.length);
  });

  test("a video over 30 s opens the trim sheet; dragging the handle picks the part", async ({ page }) => {
    const calls = await setup(page);

    await app(page).getByTestId("dev-pick-video").click();
    const chooser = page.waitForEvent("filechooser");
    await app(page).getByTestId("media-upload-computer").click();
    await (await chooser).setFiles(path.join(FIXTURES, "video-35s.webm"));

    await expect(app(page).getByTestId("trim-sheet")).toBeVisible();
    // Default window = the first 30 s of 35 s.
    await expect(app(page).getByTestId("trim-summary")).toHaveText("0:00 – 0:30 · 30 s of 0:35");
    expect(calls.sign).toHaveLength(0);

    // Drag the left edge ~100 px to the right with the mouse.
    const handle = center(await box(app(page).getByTestId("trim-handle-start")));
    await drag(page, handle, { x: handle.x + 100, y: handle.y });
    await expect(app(page).getByTestId("trim-summary")).not.toHaveText("0:00 – 0:30 · 30 s of 0:35");

    // Then drag the right edge to the far end: the window can never grow past 30 s.
    const endHandle = center(await box(app(page).getByTestId("trim-handle-end")));
    const strip = await box(app(page).getByTestId("trim-strip"));
    await drag(page, endHandle, { x: strip.x + strip.width + 40, y: endHandle.y });

    await app(page).getByTestId("trim-confirm").click();
    await expect(app(page).getByTestId("dev-done")).toBeVisible();

    expect(calls.sign).toHaveLength(1);
    const body = calls.sign[0] as { resource_type: string; trim_start: number; trim_duration: number };
    expect(body.resource_type).toBe("video");
    expect(body.trim_start).toBeGreaterThan(5);
    expect(body.trim_duration).toBeGreaterThan(0);
    expect(body.trim_duration).toBeLessThanOrEqual(30);
    // The window ends at the end of the video (35 s), so start + length = 35 (± rounding).
    expect(body.trim_start + body.trim_duration).toBeCloseTo(35, 0);
    // What Cloudinary was told to cut is exactly what was signed.
    expect(calls.upload[0].body).toContain(`so_${body.trim_start},du_${body.trim_duration}/`);
  });

  test("closing the trim sheet cancels without uploading", async ({ page }) => {
    const calls = await setup(page);

    await app(page).getByTestId("dev-pick-video").click();
    const chooser = page.waitForEvent("filechooser");
    await app(page).getByTestId("media-upload-computer").click();
    await (await chooser).setFiles(path.join(FIXTURES, "video-35s.webm"));
    await expect(app(page).getByTestId("trim-sheet")).toBeVisible();

    await app(page).getByTestId("trim-sheet-close").click();
    await expect(app(page).getByTestId("trim-sheet")).toBeHidden();
    await expect(app(page).getByTestId("dev-pick-video")).toBeEnabled();
    expect(calls.sign).toHaveLength(0);
    expect(calls.upload).toHaveLength(0);
  });

  test("a video of 30 s or less skips the trim sheet", async ({ page }) => {
    const calls = await setup(page);

    await app(page).getByTestId("dev-pick-video").click();
    const chooser = page.waitForEvent("filechooser");
    await app(page).getByTestId("media-upload-computer").click();
    await (await chooser).setFiles(path.join(FIXTURES, "video-10s.webm"));

    await expect(app(page).getByTestId("dev-done")).toBeVisible();
    await expect(app(page).getByTestId("trim-sheet")).toBeHidden();
    expect(calls.sign[0]).toEqual({ pet_id: PET_ID, resource_type: "video", purpose: "feed", booking_id: null });
  });

  test("a failed upload shows the step and Retry finishes it", async ({ page }) => {
    const calls = await setup(page, { failSignOnce: true });

    await app(page).getByTestId("dev-pick-photo").click();
    await app(page).getByTestId("sample-meal").click();

    await expect(app(page).getByTestId("dev-error")).toHaveText("Cloudinary is down.");
    await expect(app(page).getByText("Failed at: sign")).toBeVisible();

    await app(page).getByTestId("dev-retry").click();
    await expect(app(page).getByTestId("dev-done")).toBeVisible();
    expect(calls.sign).toHaveLength(2);
    expect(calls.complete).toHaveLength(1);
  });

  test("a purpose with no samples says so and still offers Upload from computer", async ({ page }) => {
    await setup(page);

    await app(page).getByTestId("dev-purpose").getByRole("radio", { name: "Label" }).click();
    await app(page).getByTestId("dev-pick-photo").click();
    await expect(app(page).getByText("No sample photos for this kind of upload yet.")).toBeVisible();
    await expect(app(page).getByTestId("media-upload-computer")).toBeVisible();
    await app(page).getByTestId("media-picker-close").click();
    await expect(app(page).getByTestId("media-picker")).toBeHidden();
  });
});
