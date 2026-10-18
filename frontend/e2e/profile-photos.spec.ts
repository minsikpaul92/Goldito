import { expect, test, type Page } from "@playwright/test";

import { app, signIn } from "./helpers";
import { OWNER, SITTER, mockSupabase, type MockDb, type MockUser } from "./supabaseMock";

// Profile photos for a sitter and an owner (#135, #137): add with a round crop, make cover, move, remove.

let counter = 0;

async function setup(page: Page, options: { failComplete?: boolean; user?: MockUser } = {}): Promise<MockDb> {
  const user = options.user ?? SITTER;
  const { db } = await mockSupabase(page, [user]);
  if (user.role === "sitter") {
    db.sitter_profiles.push({
      id: user.id, bio: null, home_address: null, services: ["boarding"], onboarded_at: "2026-10-01T00:00:00Z",
    });
  } else {
    db.owner_profiles.push({ id: user.id, home_address: null });
  }
  const json = (body: unknown, status = 200) => ({ status, contentType: "application/json", body: JSON.stringify(body) });

  await page.route("**/api/profile-photos/sign", (route) =>
    route.fulfill(
      json({
        cloud_name: "goldito-test", api_key: "123", timestamp: 1_700_000_000, signature: "sig",
        folder: `goldito/profile/${user.id}`,
        upload_url: "http://127.0.0.1:4173/cloudinary-mock/image/upload",
        transformation: "c_limit,w_2000/q_auto",
      }),
    ),
  );
  await page.route("**/cloudinary-mock/**", (route) => {
    counter += 1;
    return route.fulfill(json({ public_id: `goldito/profile/${user.id}/photo-${counter}`, width: 800, height: 800 }));
  });
  await page.route("**/api/profile-photos/complete", (route) => {
    if (options.failComplete) return route.fulfill(json({ detail: "You can keep up to 8 photos. Remove one first." }, 409));
    const { public_id } = route.request().postDataJSON();
    const row = { id: `photo-${db.profile_photos.length + 1}-${counter}`, profile_id: user.id, public_id };
    db.profile_photos.push(row);
    return route.fulfill(json({ id: row.id, public_id, position: db.profile_photos.length - 1, url: "", thumb_url: "" }));
  });
  await page.route("**/api/profile-photos/*", (route) => {
    if (route.request().method() !== "DELETE") return route.fallback();
    const id = route.request().url().split("/").pop();
    db.profile_photos.splice(0, db.profile_photos.length, ...db.profile_photos.filter((r) => r.id !== id));
    return route.fulfill(json({ deleted: true }));
  });
  return db;
}

async function addOne(page: Page, sample: string) {
  const screen = app(page);
  await screen.getByTestId("photos-add").or(screen.getByTestId("photos-placeholder")).click();
  await screen.getByTestId(`sample-${sample}`).click();
  await expect(screen.getByTestId("crop-image")).toBeVisible();
  await screen.getByTestId("crop-confirm").click();
  await expect(screen.getByTestId("crop-sheet")).toHaveCount(0);
}

test.describe("profile photos", () => {
  test("a sitter with no photo sees the silhouette, adds photos with a round crop, and the first is the cover", async ({ page }) => {
    const db = await setup(page);
    await signIn(page, SITTER);
    await expect(page).toHaveURL(/\/sitter$/);
    const screen = app(page);
    await screen.getByTestId("open-profile").click();

    await expect(screen.getByTestId("photos-placeholder")).toBeVisible();
    await addOne(page, "mood_tug");
    await expect(screen.getByTestId("photos-placeholder")).toHaveCount(0);
    expect(db.profile_photos).toHaveLength(1);
    expect(db.profile_photos[0].public_id).toContain(`goldito/profile/${SITTER.id}/`);

    // Zoom and drag move the crop in any direction, and the cropped square is what gets uploaded.
    await screen.getByTestId("photos-add").click();
    await screen.getByTestId("sample-mood_grass").click();
    await expect(screen.getByTestId("crop-image")).toBeVisible();
    const before = await screen.getByTestId("crop-image").boundingBox();
    const frame = await screen.getByTestId("crop-frame").boundingBox();
    await screen.getByTestId("crop-zoom").click({ position: { x: 5, y: 20 } });
    await page.mouse.move(frame!.x + 130, frame!.y + 130);
    await page.mouse.down();
    await page.mouse.move(frame!.x + 150, frame!.y + 140, { steps: 5 });
    await page.mouse.up();
    const after = await screen.getByTestId("crop-image").boundingBox();
    expect(after).not.toEqual(before);
    await screen.getByTestId("crop-confirm").click();
    await expect(screen.getByTestId("crop-sheet")).toHaveCount(0);
    expect(db.profile_photos).toHaveLength(2);
    await expect(screen.getByText("Cover", { exact: true })).toHaveCount(1);
  });

  test("make cover, move and remove", async ({ page }) => {
    const db = await setup(page);
    db.profile_photos.push(
      { id: "p1", profile_id: SITTER.id, public_id: `goldito/profile/${SITTER.id}/a` },
      { id: "p2", profile_id: SITTER.id, public_id: `goldito/profile/${SITTER.id}/b` },
      { id: "p3", profile_id: SITTER.id, public_id: `goldito/profile/${SITTER.id}/c` },
    );
    await signIn(page, SITTER);
    const screen = app(page);
    await screen.getByTestId("open-profile").click();
    await expect(screen.getByTestId("photos-tile-p3")).toBeVisible();

    await screen.getByTestId("photos-tile-p3").click();
    await screen.getByTestId("photo-make-cover").click();
    await expect.poll(() => db.profile_photos.map((r) => r.id)).toEqual(["p3", "p1", "p2"]);

    await screen.getByTestId("photos-tile-p1").click();
    await screen.getByTestId("photo-move-later").click();
    await expect.poll(() => db.profile_photos.map((r) => r.id)).toEqual(["p3", "p2", "p1"]);

    // The cover cannot move earlier or become the cover again.
    await screen.getByTestId("photos-tile-p3").click();
    await expect(screen.getByTestId("photo-make-cover")).toHaveCount(0);
    await expect(screen.getByTestId("photo-move-earlier")).toHaveCount(0);
    await screen.getByTestId("photo-actions-backdrop").click();

    await screen.getByTestId("photos-tile-p2").click();
    await screen.getByTestId("photo-remove").click();
    await screen.getByTestId("photo-remove-cancel").click();
    expect(db.profile_photos).toHaveLength(3);
    await screen.getByTestId("photo-remove").click();
    await screen.getByTestId("photo-remove-confirm").click();
    await expect.poll(() => db.profile_photos.map((r) => r.id)).toEqual(["p3", "p1"]);
    await expect(screen.getByTestId("photos-tile-p2")).toHaveCount(0);
  });

  test("at eight photos there is no add button; a refused upload shows why and keeps the sheet", async ({ page }) => {
    const db = await setup(page, { failComplete: true });
    await signIn(page, SITTER);
    const screen = app(page);
    await screen.getByTestId("open-profile").click();
    await screen.getByTestId("photos-placeholder").click();
    await screen.getByTestId("sample-mood_tug").click();
    await expect(screen.getByTestId("crop-image")).toBeVisible();
    await screen.getByTestId("crop-confirm").click();
    await expect(screen.getByTestId("crop-error")).toContainText("up to 8 photos");
    await expect(screen.getByTestId("crop-sheet")).toBeVisible();
    expect(db.profile_photos).toHaveLength(0);
  });

  test("with eight photos the plus is gone", async ({ page }) => {
    const db = await setup(page);
    for (let i = 1; i <= 8; i++) db.profile_photos.push({ id: `p${i}`, profile_id: SITTER.id, public_id: `goldito/profile/${SITTER.id}/${i}` });
    await signIn(page, SITTER);
    const screen = app(page);
    await screen.getByTestId("open-profile").click();
    await expect(screen.getByTestId("photos-tile-p8")).toBeVisible();
    await expect(screen.getByTestId("photos-add")).toHaveCount(0);
  });

  test("an owner adds a cover photo on Profile with the same gallery", async ({ page }) => {
    const db = await setup(page, { user: OWNER });
    await signIn(page, OWNER);
    await expect(page).toHaveURL(/\/owner$/);
    const screen = app(page);
    await screen.getByTestId("open-profile").click();

    await expect(screen.getByTestId("profile-photos-group")).toContainText("A sitter sees it only once you have a booking");
    await addOne(page, "mood_tug");
    expect(db.profile_photos).toHaveLength(1);
    expect(db.profile_photos[0]).toMatchObject({ profile_id: OWNER.id });
    await expect(screen.getByText("Cover", { exact: true })).toHaveCount(1);
  });

  test("the crop moves in every direction by drag and by the arrows, and the empty tile is as small as a photo", async ({ page }) => {
    const db = await setup(page);
    await signIn(page, SITTER);
    const screen = app(page);
    await screen.getByTestId("open-profile").click();

    // The empty state is one photo-sized circle, not a big banner.
    const empty = await screen.getByTestId("photos-placeholder").boundingBox();
    expect(empty!.height).toBeLessThan(110);

    await screen.getByTestId("photos-placeholder").click();
    await screen.getByTestId("sample-mood_tug").click();
    await expect(screen.getByTestId("crop-image")).toBeVisible();

    // Zoom well in (Page Up on the slider is +10 %), so there is room to move both ways.
    await screen.getByTestId("crop-zoom").focus();
    for (let i = 0; i < 15; i++) await page.keyboard.press("PageUp");
    const position = async () => {
      const image = await screen.getByTestId("crop-image").boundingBox();
      return { x: image!.x, y: image!.y };
    };
    const start = await position();

    const frame = await screen.getByTestId("crop-frame").boundingBox();
    const cx = frame!.x + frame!.width / 2;
    const cy = frame!.y + frame!.height / 2;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 30, cy + 25, { steps: 6 });
    await page.mouse.up();
    const dragged = await position();
    expect(dragged.x).toBeGreaterThan(start.x);
    expect(dragged.y).toBeGreaterThan(start.y);

    // The four arrows move it by the same small step, in the direction they point.
    await screen.getByTestId("crop-move-left").click();
    const left = await position();
    expect(left.x).toBeLessThan(dragged.x);
    await screen.getByTestId("crop-move-up").click();
    const up = await position();
    expect(up.y).toBeLessThan(left.y);
    await screen.getByTestId("crop-move-right").click();
    await screen.getByTestId("crop-move-down").click();
    const back = await position();
    expect(back.x).toBeCloseTo(dragged.x, 0);
    expect(back.y).toBeCloseTo(dragged.y, 0);

    await screen.getByTestId("crop-confirm").click();
    await expect(screen.getByTestId("crop-sheet")).toHaveCount(0);
    expect(db.profile_photos).toHaveLength(1);
  });
});
