import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

import { caring } from "./careFixtures";
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
  await app(page).getByRole("heading", { name: "Home" }).waitFor();
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

    // Drag by mouse: 60 px right, 30 px down.
    const p = await box(paper);
    const from = center(await box(mine));
    await drag(page, from, { x: from.x + 60, y: from.y + 30 });
    await expect.poll(async () => (await spot(mine, paper)).x).toBeCloseTo(0.5 + 60 / p.width, 1);

    await screen.getByTestId("decor-bigger").click();
    await screen.getByTestId("decor-bigger").click();
    await screen.getByTestId("decor-rotate-right").click();
    await screen.getByTestId("decor-save").click();
    await expect(screen.getByTestId("toast")).toContainText("Stickers saved");

    const saved = db.report_decor.find((r) => r.user_id === OWNER.id)!;
    const [item] = saved.items as Record<string, number | string>[];
    expect(item).toMatchObject({ sticker_id: "st-1", public_id: `goldito/${MAX.id}/sticker/a`, scale: 1.4, rotate: 15 });
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
    expect(isInside(await box(screen.getByTestId("decor-canvas")), await box(screen.getByTestId("diary-entry-paper")))).toBe(true);
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
    await app(page).getByRole("heading", { name: "Home" }).waitFor();
    await page.goto("/sitter/diary");
    const screen = app(page);
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
