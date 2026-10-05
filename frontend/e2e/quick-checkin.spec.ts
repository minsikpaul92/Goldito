import { expect, test } from "@playwright/test";

import { caring, mockUpload } from "./careFixtures";
import { app, signIn } from "./helpers";
import { OWNER, SITTER, mockSupabase } from "./supabaseMock";

// Sitter quick check-in (phase-06 6.10, reworked 6.16): tap what happened → optional memo/photo → Send.

const MAX = { id: "00000000-0000-4000-8000-0000000000aa", name: "Max", species: "dog" } as const;
const MOCHI = { id: "00000000-0000-4000-8000-0000000000bb", name: "Mochi", species: "cat" } as const;
const send = (pet: { id: string }) => `checkin-send-${pet.id}`;
const tid = (pet: { id: string }, kind: string, value: string) => `checkin-${pet.id}-${kind}-${value}`;

async function openCheckin(page: import("@playwright/test").Page, petId: string) {
  await signIn(page, SITTER);
  await app(page).getByRole("heading", { name: "Home" }).waitFor();
  await page.goto(`/sitter/checkin/${petId}`);
  await app(page).getByTestId(`checkin-${petId}`).waitFor();
}

async function setup(page: import("@playwright/test").Page, petId: string = MAX.id) {
  const { db } = await mockSupabase(page, [OWNER, SITTER]);
  caring(db, [MAX, MOCHI]);
  await openCheckin(page, petId);
  return db;
}

test.describe("quick check-in", () => {
  test("tap, then Send: the preset update goes out — no typing; a tap alone sends nothing", async ({ page }) => {
    const db = await setup(page);
    const screen = app(page);
    await expect(screen.getByTestId(send(MAX))).toBeDisabled();
    await screen.getByTestId(tid(MAX, "meal", "all")).click();
    await expect(screen.getByTestId(tid(MAX, "meal", "all"))).toHaveAttribute("aria-pressed", "true");
    await expect(screen.getByTestId(`checkin-picked-${MAX.id}`)).toContainText("Ready to send: ");
    await page.waitForTimeout(300);
    expect(db.care_checkins).toHaveLength(0);
    // Tapping the same option again unpicks it.
    await screen.getByTestId(tid(MAX, "meal", "all")).click();
    await expect(screen.getByTestId(send(MAX))).toBeDisabled();
    await screen.getByTestId(tid(MAX, "meal", "all")).click();
    await screen.getByTestId(send(MAX)).click();
    await expect(screen.getByTestId("toast")).toContainText("Sent ✅ Chloe was told");

    expect(db.care_checkins).toHaveLength(1);
    expect(db.care_checkins[0]).toMatchObject({ pet_id: MAX.id, kind: "meal", value: "all", note_text: null, media_id: null });
    expect(db.notifications.find((n) => n.type === "care_checkin")?.title).toBe("Max meal all");
  });

  test("Send clears the pick (no double send); today's sent list shows what went out", async ({ page }) => {
    const db = await setup(page);
    const screen = app(page);
    await screen.getByTestId(tid(MAX, "meal", "all")).click();
    await screen.getByTestId(send(MAX)).click();
    await expect(screen.getByTestId("toast")).toContainText("Sent ✅");
    await expect(screen.getByTestId(send(MAX))).toBeDisabled(); // nothing picked any more
    await expect(screen.getByTestId(tid(MAX, "meal", "all"))).toHaveAttribute("aria-pressed", "false");
    expect(db.care_checkins).toHaveLength(1);

    await screen.getByTestId(tid(MAX, "mood", "calm")).click();
    await screen.getByTestId(send(MAX)).click();
    await expect(screen.getByTestId(`checkin-sent-${MAX.id}`)).toContainText("Sent to Chloe today");
    await expect(screen.getByTestId(`checkin-sent-${MAX.id}`)).toContainText("Fed · All");
    await expect(screen.getByTestId(`checkin-sent-${MAX.id}`)).toContainText("Mood · Calm");
    expect(db.care_checkins).toHaveLength(2);
  });

  test("a failure stays on screen in a dialog; Try again sends it", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    caring(db, [MAX]);
    let failed = false;
    await page.route("**/rest/v1/rpc/log_care_checkin", (route) => {
      if (failed) return route.fallback();
      failed = true;
      return route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({ code: "P0001", message: "not_in_care_window" }),
      });
    });
    await openCheckin(page, MAX.id);
    const screen = app(page);

    await screen.getByTestId(tid(MAX, "meal", "most")).click();
    await screen.getByTestId(send(MAX)).click();
    await expect(screen.getByTestId("error-dialog-message")).toContainText("Tasks open once the stay has started.");
    expect(db.care_checkins).toHaveLength(0);
    await page.waitForTimeout(3500);
    await expect(screen.getByTestId("error-dialog")).toBeVisible();

    await screen.getByTestId("error-dialog-retry").click();
    await expect(screen.getByTestId("toast")).toContainText("Sent ✅");
    expect(db.care_checkins).toHaveLength(1);
  });

  test("a typed memo rides along with what was sent, then clears", async ({ page }) => {
    const db = await setup(page);
    const screen = app(page);
    await screen.getByTestId(`checkin-memo-${MAX.id}`).fill("Left the chicken bits, sniffed and walked off");
    await screen.getByTestId(tid(MAX, "meal", "little")).click();
    await screen.getByTestId(send(MAX)).click();
    await expect(screen.getByTestId("toast")).toContainText("Sent ✅");

    expect(db.care_checkins[0]).toMatchObject({ kind: "meal", value: "little", note_text: "Left the chicken bits, sniffed and walked off" });
    const notice = db.notifications.find((n) => n.type === "care_checkin");
    expect(notice?.title).toBe("Max meal little"); // what was sent
    expect(notice?.body).toBe("Left the chicken bits, sniffed and walked off"); // + the memo
    await expect(screen.getByTestId(`checkin-memo-${MAX.id}`)).toHaveValue("");
  });

  test("a memo with nothing picked is sent as a note; with no memo Send stays off", async ({ page }) => {
    const db = await setup(page);
    const screen = app(page);
    await expect(screen.getByTestId(send(MAX))).toBeDisabled();
    expect(db.care_checkins).toHaveLength(0);

    await screen.getByTestId(`checkin-memo-${MAX.id}`).fill("Watched a squirrel for ten minutes");
    await expect(screen.getByTestId(`checkin-picked-${MAX.id}`)).toContainText("as a note");
    await screen.getByTestId(send(MAX)).click();
    await expect(screen.getByTestId("toast")).toContainText("Sent ✅");
    expect(db.care_checkins[0]).toMatchObject({ kind: "note", value: null, note_text: "Watched a squirrel for ten minutes" });
  });

  test("walks are offered for the dog only; each pet has its own check-in screen", async ({ page }) => {
    await setup(page);
    const screen = app(page);
    await expect(screen.getByTestId(tid(MAX, "walk", "30"))).toBeVisible();
    await expect(screen.getByTestId(`checkin-${MOCHI.id}`)).toHaveCount(0);

    await page.goto(`/sitter/checkin/${MOCHI.id}`);
    await screen.getByTestId(`checkin-${MOCHI.id}`).waitFor();
    await expect(screen.getByTestId(tid(MOCHI, "walk", "30"))).toHaveCount(0);
    await expect(screen.getByTestId(tid(MOCHI, "mood", "calm"))).toBeVisible();
    await screen.getByTestId(tid(MOCHI, "mood", "calm")).click();
    await screen.getByTestId(send(MOCHI)).click();
    await expect(screen.getByTestId("toast")).toContainText("Sent ✅");
  });

  test("a photo rides along: pick, preview, then it uploads with the next check-in", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    caring(db, [MAX]);
    const sign = await mockUpload(page, db, MAX.id);
    await openCheckin(page, MAX.id);
    const screen = app(page);

    await screen.getByTestId(`checkin-photo-${MAX.id}`).click();
    await screen.getByTestId("sample-walk").click();
    await expect(screen.getByTestId("media-confirm-preview")).toBeVisible();
    await screen.getByTestId("media-confirm-use").click();
    await expect(screen.getByTestId(`checkin-photo-${MAX.id}`)).toContainText("Photo ready");
    expect(sign).toHaveLength(0); // nothing uploaded until a check-in is sent

    await screen.getByTestId(tid(MAX, "mood", "happy")).click();
    await screen.getByTestId(send(MAX)).click();
    await expect(screen.getByTestId("toast")).toContainText("Sent ✅");
    expect(sign[0]).toMatchObject({ pet_id: MAX.id, purpose: "task_proof" });
    expect(db.care_checkins[0].media_id).toBe("media-proof");
    await expect(screen.getByTestId(`checkin-photo-${MAX.id}`)).toContainText("Add photo");
  });
});
