import { promises as fs } from "node:fs";

import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

import { caring, mockUpload } from "./careFixtures";
import { NOON_TORONTO, TODAY_TORONTO, app, box, center, drag, isInside, signIn } from "./helpers";
import { MockDb, OWNER, SITTER, mockSupabase } from "./supabaseMock";

// Diary decorating (Phase 12.3b, D61): on a sent daily report the owner and the sitter each keep their own sticker
// layer — add from the pet's sticker box, drag with the mouse, size, turn, save — and each sees the other's layer in
// the same spot of the same paper. The report text is never changed.

const MAX = { id: "00000000-0000-4000-8000-0000000000aa", name: "Max", species: "dog" } as const;

function seedSticker(db: MockDb, by: string) {
  db.media.push({ id: "m-st", pet_id: MAX.id, uploaded_by: by, cloudinary_public_id: `goldito/${MAX.id}/sticker/a`, resource_type: "image", purpose: "sticker" });
  db.pet_stickers.push({ id: "st-1", pet_id: MAX.id, media_id: "m-st", created_by: by, created_at: "2026-10-05T10:00:00Z" });
}

function layer(userId: string, x: number, y: number) {
  return {
    report_id: "sent1",
    user_id: userId,
    items: [{ sticker_id: "st-1", public_id: `goldito/${MAX.id}/sticker/a`, x, y, scale: 1, rotate: 0, z: 1 }],
    updated_at: "2026-10-05T23:00:00Z",
  };
}

function sentReport(id: string, day: string) {
  return {
    id,
    pet_id: MAX.id,
    sitter_id: SITTER.id,
    report_date: day,
    body: "A calm day. Max napped a lot! Then we walked.",
    status: "sent",
    sent_at: `${day}T22:00:00Z`,
    source_snapshot: { tasks: [] },
    created_at: `${day}T22:00:00Z`,
  };
}

/** Where a sticker sits on the paper, as 0–1 of the paper (its centre). */
async function spot(sticker: Locator, paper: Locator) {
  const s = center(await box(sticker));
  const p = await box(paper);
  return { x: (s.x - p.x) / p.width, y: (s.y - p.y) / p.height };
}

async function openOwnerEntry(page: Page, seed: (db: MockDb) => void) {
  const { db } = await mockSupabase(page, [OWNER, SITTER]);
  caring(db, [MAX]);
  db.daily_reports.push(sentReport("sent1", "2026-10-05"));
  seed(db);
  await signIn(page, OWNER);
  await app(page).getByRole("heading", { name: /^(Home|Today)$/ }).first().waitFor();
  await page.goto("/owner/diary/sent1");
  await app(page).getByTestId("diary-entry-paper").waitFor();
  return db;
}

test.describe("diary decorating", () => {
  test("owner: add a sticker, drag it with the mouse, size and turn it, save — it stays put after a reload", async ({ page }) => {
    const db = await openOwnerEntry(page, (d) => {
      seedSticker(d, SITTER.id);
      d.report_decor.push(layer(SITTER.id, 0.8, 0.3)); // the sitter's layer is already there
    });
    const screen = app(page);
    const paper = screen.getByTestId("diary-entry-paper");

    // The sitter's sticker sits where she put it, under the text's paper.
    const other = screen.getByTestId("decor-other");
    await expect(other).toHaveCount(1);
    const o = await spot(other, paper);
    expect(o.x).toBeCloseTo(0.8, 1);
    expect(o.y).toBeCloseTo(0.3, 1);

    await screen.getByTestId("decor-start").click();
    await screen.getByTestId("decor-add").click();
    const mine = screen.getByTestId("decor-mine");
    await expect(mine).toHaveCount(1);
    await expect(mine).toHaveAttribute("data-selected", "true");

    // Drag by mouse: 60 px right, 30 px down. The sticker sits mid-page: bring it to the middle of the screen first, so
    // the tab bar (or the phone's edge) is never under the pointer.
    await mine.evaluate((el) => el.scrollIntoView({ block: "center" }));
    const p = await box(paper);
    const from = center(await box(mine));
    await drag(page, from, { x: from.x + 60, y: from.y + 30 });
    await expect.poll(async () => (await spot(mine, paper)).x).toBeCloseTo(0.5 + 60 / p.width, 1);

    // No size or turn buttons any more: the corner handle does both (#369, next test).
    await expect(screen.getByTestId("decor-bigger")).toHaveCount(0);
    await screen.getByTestId("decor-save").click();
    await expect(screen.getByTestId("toast")).toContainText("Stickers saved");

    const saved = db.report_decor.find((r) => r.user_id === OWNER.id)!;
    const [item] = saved.items as Record<string, number | string>[];
    expect(item).toMatchObject({ sticker_id: "st-1", public_id: `goldito/${MAX.id}/sticker/a`, scale: 1, rotate: 0 });
    expect(Number(item.x)).toBeCloseTo(0.5 + 60 / p.width, 1);
    expect(Number(item.y)).toBeCloseTo(0.5 + 30 / p.height, 1);
    // The sitter's layer is untouched, and so is the text.
    expect(db.report_decor.find((r) => r.user_id === SITTER.id)!.items).toEqual(layer(SITTER.id, 0.8, 0.3).items);
    await expect(screen.getByTestId("diary-entry-body")).toContainText("Then we walked.");

    const before = await spot(mine, paper);
    await page.reload();
    await screen.getByTestId("diary-entry-paper").waitFor();
    await expect(screen.getByTestId("decor-mine")).toHaveCount(1);
    const after = await spot(screen.getByTestId("decor-mine"), screen.getByTestId("diary-entry-paper"));
    expect(after.x).toBeCloseTo(before.x, 2);
    expect(after.y).toBeCloseTo(before.y, 2);
    expect(isInside(await box(screen.getByTestId("decor-canvas-front")), await box(screen.getByTestId("diary-entry-paper")))).toBe(true);
  });

  test("the corner handle sizes and turns the picked sticker, within the limits (#369)", async ({ page }) => {
    const db = await openOwnerEntry(page, (d) => seedSticker(d, OWNER.id));
    const screen = app(page);
    await screen.getByTestId("decor-start").click();
    await screen.getByTestId("decor-add").click();
    const mine = screen.getByTestId("decor-mine");
    await mine.evaluate((el) => el.scrollIntoView({ block: "center" }));
    const handle = screen.getByTestId("decor-resize");
    await expect(handle).toHaveCount(1); // only on the picked sticker

    // Half as far again from the centre: half as big again.
    const c = center(await box(mine));
    const h = center(await box(handle));
    await drag(page, h, { x: c.x + (h.x - c.x) * 1.5, y: c.y + (h.y - c.y) * 1.5 });
    // A quarter turn around the centre.
    const h2 = center(await box(handle));
    await drag(page, h2, { x: c.x - (h2.y - c.y), y: c.y + (h2.x - c.x) });
    await screen.getByTestId("decor-save").click();
    await expect(screen.getByTestId("toast")).toContainText("Stickers saved");
    let [item] = db.report_decor.find((r) => r.user_id === OWNER.id)!.items as Record<string, number>[];
    expect(item.scale).toBeCloseTo(1.5, 1);
    expect(Math.abs(item.rotate - 90)).toBeLessThan(4);

    // Far out it stops at the biggest size.
    await screen.getByTestId("decor-start").click();
    await screen.getByTestId("decor-mine").click();
    const h3 = center(await box(handle));
    await drag(page, h3, { x: c.x + (h3.x - c.x) * 6, y: c.y + (h3.y - c.y) * 6 });
    await screen.getByTestId("decor-save").click();
    await expect(screen.getByTestId("toast")).toContainText("Stickers saved");
    [item] = db.report_decor.find((r) => r.user_id === OWNER.id)!.items as Record<string, number>[];
    expect(item.scale).toBe(2.5);
  });

  test("two fingers on a sticker pinch it bigger (#369)", async ({ page, browserName }) => {
    test.skip(browserName !== "chromium", "touch points are sent through Chrome DevTools");
    const db = await openOwnerEntry(page, (d) => seedSticker(d, OWNER.id));
    const screen = app(page);
    await screen.getByTestId("decor-start").click();
    await screen.getByTestId("decor-add").click();
    const mine = screen.getByTestId("decor-mine");
    await mine.evaluate((el) => el.scrollIntoView({ block: "center" }));
    const s = await box(mine);
    const c = center(s);
    const d0 = s.width / 4;
    const cdp = await page.context().newCDPSession(page);
    const at = (d: number) => [
      { x: c.x - d, y: c.y, id: 1 },
      { x: c.x + d, y: c.y, id: 2 },
    ];
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: at(d0) });
    for (let i = 1; i <= 10; i++) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: at(d0 * (1 + i / 10)) });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await screen.getByTestId("decor-save").click();
    await expect(screen.getByTestId("toast")).toContainText("Stickers saved");
    const [item] = db.report_decor.find((r) => r.user_id === OWNER.id)!.items as Record<string, number>[];
    expect(item.scale).toBeCloseTo(2, 1);
    // A pinch does not move the sticker.
    expect(item.x).toBeCloseTo(0.5, 1);
  });

  test("Cancel keeps what was saved; Remove takes the picked sticker off", async ({ page }) => {
    const db = await openOwnerEntry(page, (d) => {
      seedSticker(d, OWNER.id);
      d.report_decor.push(layer(OWNER.id, 0.3, 0.6));
    });
    const screen = app(page);
    await screen.getByTestId("decor-start").click();
    await screen.getByTestId("decor-add").click();
    await expect(screen.getByTestId("decor-mine")).toHaveCount(2);
    await screen.getByTestId("decor-cancel").click();
    await expect(screen.getByTestId("decor-mine")).toHaveCount(1);
    expect(db.report_decor).toHaveLength(1);

    await screen.getByTestId("decor-start").click();
    await screen.getByTestId("decor-mine").click();
    await screen.getByTestId("decor-remove").click();
    await screen.getByTestId("decor-save").click();
    await expect(screen.getByTestId("toast")).toContainText("Stickers saved");
    expect(db.report_decor[0].items).toEqual([]);
    await expect(screen.getByTestId("decor-mine")).toHaveCount(0);
  });

  test("a picture-diary page: new stickers go over the writing; one saved behind it stays there and still drags", async ({ page }) => {
    // No Behind text button any more (#369): a sticker saved behind the writing earlier keeps its side.
    const db = await openOwnerEntry(page, (d) =>
      d.report_decor.push({
        report_id: "sent1",
        user_id: OWNER.id,
        items: [{ sticker_id: "preset:heart", public_id: "preset:heart", x: 0.5, y: 0.5, scale: 1, rotate: 0, z: 1, layer: "back" }],
        updated_at: "2026-10-05T23:00:00Z",
      }),
    );
    const screen = app(page);
    // Date and pet on top, like a picture diary (2026-10-05 is a Monday).
    await expect(screen.getByTestId("diary-entry-header")).toContainText("Monday, Oct 5");
    await expect(screen.getByTestId("diary-entry-header")).toContainText("Max's day");
    await expect(screen.getByTestId("diary-entry-picture")).toBeVisible();

    const front = screen.getByTestId("decor-canvas-front").getByTestId("decor-mine");
    const back = screen.getByTestId("decor-canvas-back").getByTestId("decor-mine");
    await expect(back).toHaveCount(1); // under the writing
    await screen.getByTestId("decor-start").click();
    await expect(screen.getByTestId("decor-layer")).toHaveCount(0);
    // While decorating it floats (faded) on the front canvas so the mouse can still grab it.
    await expect(front).toHaveCount(1);
    await expect(front).toHaveAttribute("data-layer", "back");
    const paper = screen.getByTestId("diary-entry-paper");
    await front.evaluate((el) => el.scrollIntoView({ block: "center" }));
    const p = await box(paper);
    const from = center(await box(front));
    await drag(page, from, { x: from.x - 50, y: from.y + 20 });
    await expect.poll(async () => (await spot(front, paper)).x).toBeCloseTo(0.5 - 50 / p.width, 1);

    await screen.getByTestId("decor-preset-star").click();
    await expect(screen.getByTestId("decor-canvas-front").locator("[data-layer='front']")).toHaveCount(1); // new ones go over the writing

    await screen.getByTestId("decor-save").click();
    await expect(screen.getByTestId("toast")).toContainText("Stickers saved");
    const items = db.report_decor[0].items as Record<string, unknown>[];
    expect(items.map((i) => i.layer ?? "front")).toEqual(["back", "front"]);
    // Saved, the old one goes back under the writing.
    await expect(back).toHaveCount(1);
    await expect(front).toHaveCount(1); // the new star
    await expect(back).toHaveAttribute("data-layer", "back");
  });

  test("Save image: the decorated page downloads as a PNG with the sticker painted where it sits (11.8)", async ({ page }) => {
    await openOwnerEntry(page, (d) => {
      d.report_decor.push({
        report_id: "sent1",
        user_id: OWNER.id,
        items: [{ sticker_id: "preset:heart", public_id: "preset:heart", x: 0.5, y: 0.5, scale: 1.5, rotate: 0, z: 1 }],
        updated_at: "2026-10-05T23:00:00Z",
      });
    });
    const screen = app(page);
    const paper = screen.getByTestId("diary-entry-paper");
    await expect(screen.getByTestId("decor-mine")).toHaveCount(1);
    // Layout size (the phone frame may be scaled on screen; the image is drawn at the page's own size).
    // After the handwriting font is in: it can change the header's height by a pixel.
    const p = await paper.evaluate(async (el) => {
      await document.fonts.ready;
      return { width: (el as HTMLElement).offsetWidth, height: (el as HTMLElement).offsetHeight };
    });

    const download = page.waitForEvent("download");
    await screen.getByTestId("decor-share").click();
    await screen.getByTestId("decor-save-image").click();
    const file = await download;
    expect(file.suggestedFilename()).toBe("goldito-max-diary-2026-10-05.png");
    await expect(screen.getByTestId("toast")).toContainText("Saved Max's diary page");

    const bytes = await fs.readFile(await file.path());
    expect(bytes.subarray(1, 4).toString("ascii")).toBe("PNG");
    // Twice the paper's size on screen (IHDR width / height).
    expect(bytes.readUInt32BE(16)).toBe(p.width * 2);
    // ±1 px: opening the Share sheet can nudge the layout by a pixel.
    expect(Math.abs(bytes.readUInt32BE(20) - p.height * 2)).toBeLessThanOrEqual(2);

    // The heart is painted at the middle of the page; a corner of the paper is plain paper.
    const [centre, corner] = await page.evaluate(async (b64) => {
      const img = new Image();
      img.src = `data:image/png;base64,${b64}`;
      await img.decode();
      const c = document.createElement("canvas");
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const ctx = c.getContext("2d")!;
      ctx.drawImage(img, 0, 0);
      const at = (x: number, y: number) => Array.from(ctx.getImageData(x, y, 1, 1).data);
      return [at(c.width / 2, c.height / 2), at(12, c.height - 12)];
    }, bytes.toString("base64"));
    expect(corner[3]).toBe(255); // the paper is opaque
    expect(centre).not.toEqual(corner);
  });

  test("Share → Copy public link says it is public, uploads the page once as a diary_page image, and shows the link", async ({ page }) => {
    const db = await openOwnerEntry(page, () => undefined);
    const sign = await mockUpload(page, db, MAX.id);
    const screen = app(page);
    await screen.getByTestId("decor-share").click();
    await expect(screen.getByTestId("decor-link-note")).toContainText("anyone who has the link can open it");
    expect(sign).toHaveLength(0); // nothing is uploaded before the tap
    await screen.getByTestId("decor-copy-link").click();
    await expect(screen.getByTestId("decor-link")).toHaveText("x"); // the mock's secure_url
    expect(sign).toHaveLength(1);
    expect(sign[0]).toMatchObject({ pet_id: MAX.id, purpose: "diary_page", resource_type: "image" });
    // Same page, same stickers: the same link, no second upload.
    await screen.getByTestId("decor-copy-link").click();
    await expect(screen.getByTestId("decor-link")).toHaveText("x");
    expect(sign).toHaveLength(1);
  });

  test("no stickers yet: the tools point to Snap → Sticker", async ({ page }) => {
    await openOwnerEntry(page, () => undefined);
    const screen = app(page);
    await screen.getByTestId("decor-start").click();
    await expect(screen.getByTestId("decor-no-stickers")).toBeVisible();
    await screen.getByTestId("decor-make").click();
    await expect(page).toHaveURL(/\/owner\/snap\/sticker$/);
  });

  test("sitter: today's sent report shows the owner's stickers, and the sitter adds her own layer", async ({ page }) => {
    await page.clock.setFixedTime(NOON_TORONTO);
    const { db } = await mockSupabase(page, [OWNER, SITTER], { now: NOON_TORONTO });
    caring(db, [MAX], NOON_TORONTO);
    db.daily_reports.push({ ...sentReport("sent1", TODAY_TORONTO), sent_at: NOON_TORONTO.toISOString() });
    seedSticker(db, OWNER.id);
    db.report_decor.push(layer(OWNER.id, 0.25, 0.7));
    await page.route("**/api/ai/report-chips", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ summary: { tasks_done: 0, tasks_missed: 0, checkins: 0 }, chips: [], photos: [] }) }),
    );
    await signIn(page, SITTER);
    await app(page).getByRole("heading", { name: /^(Home|Today)$/ }).first().waitFor();
    await page.goto("/sitter/diary");
    const screen = app(page);
    await screen.getByTestId("sitter-diary-view-today").click();
    const paper = screen.getByTestId(`report-sent-paper-${MAX.id}-paper`);
    await paper.waitFor();

    const other = screen.getByTestId("decor-other");
    await expect(other).toHaveCount(1);
    const o = await spot(other, paper);
    expect(o.x).toBeCloseTo(0.25, 1);
    expect(o.y).toBeCloseTo(0.7, 1);

    await screen.getByTestId("decor-start").click();
    await screen.getByTestId("decor-add").click();
    await screen.getByTestId("decor-save").click();
    await expect(screen.getByTestId("toast")).toContainText("Stickers saved");
    expect(db.report_decor.map((r) => r.user_id).sort()).toEqual([OWNER.id, SITTER.id].sort());
  });
});
