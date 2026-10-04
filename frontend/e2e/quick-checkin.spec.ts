import { expect, test } from "@playwright/test";

import { caring, mockUpload } from "./careFixtures";
import { app, signIn } from "./helpers";
import { OWNER, SITTER, mockSupabase } from "./supabaseMock";

// Sitter Home quick check-in (phase-06 6.10): one tap, optional memo, optional photo.

const MAX = { id: "00000000-0000-4000-8000-0000000000aa", name: "Max", species: "dog" } as const;
const MOCHI = { id: "00000000-0000-4000-8000-0000000000bb", name: "Mochi", species: "cat" } as const;
const tid = (pet: { id: string }, kind: string, value: string) => `checkin-${pet.id}-${kind}-${value}`;

async function setup(page: import("@playwright/test").Page) {
  const { db } = await mockSupabase(page, [OWNER, SITTER]);
  caring(db, [MAX, MOCHI]);
  await signIn(page, SITTER);
  await app(page).getByTestId("quick-checkin").waitFor();
  return db;
}

test.describe("quick check-in", () => {
  test("one tap sends the preset update — no typing", async ({ page }) => {
    const db = await setup(page);
    const screen = app(page);
    await screen.getByTestId(tid(MAX, "meal", "all")).click();
    await expect(screen.getByTestId("toast")).toContainText("Sent ✅ Chloe was told");

    expect(db.care_checkins).toHaveLength(1);
    expect(db.care_checkins[0]).toMatchObject({ pet_id: MAX.id, kind: "meal", value: "all", note_text: null, media_id: null });
    expect(db.notifications.find((n) => n.type === "care_checkin")?.title).toBe("Max meal all");
  });

  test("a typed memo replaces the preset, then clears", async ({ page }) => {
    const db = await setup(page);
    const screen = app(page);
    await screen.getByTestId(`checkin-memo-${MAX.id}`).fill("Left the chicken bits, sniffed and walked off");
    await screen.getByTestId(tid(MAX, "meal", "little")).click();
    await expect(screen.getByTestId("toast")).toContainText("Sent ✅");

    expect(db.care_checkins[0]).toMatchObject({ kind: "meal", value: "little", note_text: "Left the chicken bits, sniffed and walked off" });
    expect(db.notifications.find((n) => n.type === "care_checkin")?.title).toBe("Max: Left the chicken bits, sniffed and walked off");
    await expect(screen.getByTestId(`checkin-memo-${MAX.id}`)).toHaveValue("");
  });

  test("a note needs text; with text it is sent as a note", async ({ page }) => {
    const db = await setup(page);
    const screen = app(page);
    await screen.getByTestId(`checkin-note-${MAX.id}`).click();
    await expect(screen.getByText("Type a note first.")).toBeVisible();
    expect(db.care_checkins).toHaveLength(0);

    await screen.getByTestId(`checkin-memo-${MAX.id}`).fill("Watched a squirrel for ten minutes");
    await screen.getByTestId(`checkin-note-${MAX.id}`).click();
    await expect(screen.getByTestId("toast")).toContainText("Sent ✅");
    expect(db.care_checkins[0]).toMatchObject({ kind: "note", value: null, note_text: "Watched a squirrel for ten minutes" });
  });

  test("walks are offered for the dog only; every pet has its own card", async ({ page }) => {
    await setup(page);
    const screen = app(page);
    await expect(screen.getByTestId(tid(MAX, "walk", "30"))).toBeVisible();
    await expect(screen.getByTestId(tid(MOCHI, "walk", "30"))).toHaveCount(0);
    await expect(screen.getByTestId(tid(MOCHI, "mood", "calm"))).toBeVisible();
    await screen.getByTestId(tid(MOCHI, "mood", "calm")).click();
    await expect(screen.getByTestId("toast")).toContainText("Sent ✅");
  });

  test("a photo rides along: pick, preview, then it uploads with the next check-in", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    caring(db, [MAX]);
    const sign = await mockUpload(page, db, MAX.id);
    await signIn(page, SITTER);
    const screen = app(page);

    await screen.getByTestId(`checkin-photo-${MAX.id}`).click();
    await screen.getByTestId("sample-walk").click();
    await expect(screen.getByTestId("media-confirm-preview")).toBeVisible();
    await screen.getByTestId("media-confirm-use").click();
    await expect(screen.getByTestId(`checkin-photo-${MAX.id}`)).toContainText("Photo ready");
    expect(sign).toHaveLength(0); // nothing uploaded until a check-in is sent

    await screen.getByTestId(tid(MAX, "mood", "happy")).click();
    await expect(screen.getByTestId("toast")).toContainText("Sent ✅");
    expect(sign[0]).toMatchObject({ pet_id: MAX.id, purpose: "task_proof" });
    expect(db.care_checkins[0].media_id).toBe("media-proof");
    await expect(screen.getByTestId(`checkin-photo-${MAX.id}`)).toContainText("Add photo");
  });
});
