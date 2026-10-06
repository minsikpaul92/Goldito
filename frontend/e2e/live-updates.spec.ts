import { expect, test } from "@playwright/test";

import { caring } from "./careFixtures";
import { app, box, drag, signIn } from "./helpers";
import { OWNER, SITTER, mockSupabase } from "./supabaseMock";

// Owner Home live updates + the Diary tab (phase 06 follow-up).

const MAX = "00000000-0000-4000-8000-0000000000aa";
const nid = (i: number) => `00000000-0000-4000-8000-00000000d00${i}`;
const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString();

async function ownerHome(page: import("@playwright/test").Page) {
  const { db } = await mockSupabase(page, [OWNER, SITTER]);
  db.pets.push({ id: MAX, owner_id: OWNER.id, species: "dog", name: "Max", breed: null, birthdate: null, weight_kg: null, notes: null, created_at: "2026-10-01T09:00:00Z" });
  const n = (i: number, type: string, title: string, minutes: number) =>
    db.notifications.push({
      id: nid(i),
      user_id: OWNER.id,
      type,
      title,
      body: null,
      pet_id: MAX,
      booking_id: null,
      ref_id: null,
      read_at: null,
      created_at: ago(minutes),
    });
  n(1, "task_done", "Max had breakfast on time 🍽️", 50);
  n(2, "care_checkin", "Max ate a little 🍽️", 40);
  db.notifications[db.notifications.length - 1].body = "Left the chicken bits";
  n(3, "feed_post", "New photo of Max 📸", 30);
  n(4, "booking_confirmed", "Lucy confirmed your booking", 20); // not part of the live stream
  n(5, "care_checkin", "Max seems calm 😊", 10);
  // The record the notices point at stays in History whatever happens to them.
  db.care_checkins.push({ id: "c-mood", pet_id: MAX, created_by: SITTER.id, kind: "mood", value: "calm", note_text: null, media_id: null, created_at: ago(10) });
  await signIn(page, OWNER);
  await app(page).getByTestId("live-updates").waitFor();
  return db;
}

test.describe("owner live updates", () => {
  test("Home shows the latest three stay updates as cards, newest first", async ({ page }) => {
    await ownerHome(page);
    const screen = app(page);
    await expect(screen.getByTestId(`live-${nid(5)}`)).toContainText("Max seems calm");
    await expect(screen.getByTestId(`live-${nid(3)}`)).toContainText("New photo of Max");
    await expect(screen.getByTestId(`live-${nid(2)}`)).toContainText("Max ate a little");
    await expect(screen.getByTestId(`live-${nid(2)}`)).toContainText("Left the chicken bits"); // the memo, under what was sent
    // Older ones and non-stay notices stay out of the cards.
    await expect(screen.getByTestId(`live-${nid(1)}`)).toHaveCount(0);
    await expect(screen.getByTestId(`live-${nid(4)}`)).toHaveCount(0);
    await expect(screen.getByTestId("live-more")).toHaveText("1 more in notifications");
  });

  test("swipe a card away to dismiss it; the record is still in History", async ({ page }) => {
    const db = await ownerHome(page);
    const screen = app(page);
    const row = await box(screen.getByTestId(`live-swipe-${nid(5)}`));
    const y = row.y + row.height / 2;
    await drag(page, { x: row.x + row.width - 12, y }, { x: row.x + row.width * 0.15, y }, 14);

    await expect(screen.getByTestId(`live-${nid(5)}`)).toHaveCount(0);
    expect(db.notifications.find((x) => x.id === nid(5))).toBeUndefined();
    // The next-newest slides in.
    await expect(screen.getByTestId(`live-${nid(1)}`)).toBeVisible();

    await screen.getByTestId("open-history").click();
    await expect(page).toHaveURL(/\/owner\/history(\?pet=.*)?$/);
    await expect(screen.getByText("Mood · Calm")).toBeVisible();
    expect(db.care_checkins).toHaveLength(1);
  });

  test("✕ on the top card reveals Clear all, which clears the live updates but not other notices", async ({ page }) => {
    const db = await ownerHome(page);
    const screen = app(page);
    await expect(screen.getByTestId("live-clear-all")).toHaveCount(0);
    await screen.getByTestId("live-x").click();
    await screen.getByTestId("live-clear-cancel").click(); // Cancel keeps everything
    await expect(screen.getByTestId("live-clear-all")).toHaveCount(0);
    await expect(screen.getByTestId(`live-${nid(5)}`)).toBeVisible();

    await screen.getByTestId("live-x").click();
    await screen.getByTestId("live-clear-all").click();
    await expect(screen.getByTestId("live-empty")).toBeVisible();
    expect(db.notifications.map((x) => x.id)).toEqual([nid(4)]); // the booking notice stays
  });

  test("a short swipe keeps the card; a tap opens History for a check-in", async ({ page }) => {
    const db = await ownerHome(page);
    const screen = app(page);
    const row = await box(screen.getByTestId(`live-swipe-${nid(5)}`));
    const y = row.y + row.height / 2;
    await drag(page, { x: row.x + row.width - 12, y }, { x: row.x + row.width * 0.7, y }, 14);
    await expect(screen.getByTestId(`live-${nid(5)}`)).toBeVisible();
    expect(db.notifications.some((x) => x.id === nid(5))).toBe(true);

    await screen.getByTestId(`live-${nid(5)}`).click();
    await expect(page).toHaveURL(/\/owner\/history(\?pet=.*)?$/);
  });

  test("with nothing new Home says so; the Diary tab waits for the sitter's written diary", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    db.pets.push({ id: MAX, owner_id: OWNER.id, species: "dog", name: "Max", breed: null, birthdate: null, weight_kg: null, notes: null, created_at: "2026-10-01T09:00:00Z" });
    await signIn(page, OWNER);
    await app(page).getByTestId("live-updates").waitFor();
    await expect(app(page).getByTestId("live-empty")).toContainText("Nothing new");

    await page.goto("/owner/diary");
    await expect(app(page).getByText("When your sitter writes up the day", { exact: false })).toBeVisible();
    await app(page).getByRole("button", { name: "Open History" }).click();
    await expect(page).toHaveURL(/\/owner\/history(\?pet=.*)?$/);
  });

  test("a notice with a photo and memo shows a thumbnail, opens big, and the button goes to that pet's History", async ({ page }) => {
    const MOCHI = "00000000-0000-4000-8000-0000000000bb";
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    db.pets.push(
      { id: MAX, owner_id: OWNER.id, species: "dog", name: "Max", breed: null, birthdate: null, weight_kg: null, notes: null, created_at: "2026-10-01T09:00:00Z" },
      { id: MOCHI, owner_id: OWNER.id, species: "cat", name: "Mochi", breed: null, birthdate: null, weight_kg: null, notes: null, created_at: "2026-10-01T09:05:00Z" },
    );
    db.media.push({ id: "m-nap", pet_id: MOCHI, cloudinary_public_id: `pawddy/${MOCHI}/task_proof/m-nap`, resource_type: "image", purpose: "task_proof" });
    db.care_tasks.push({ id: "t-nap", pet_id: MOCHI, type: "sleep", title: "Nap", scheduled_time: "13:00:00", active: true });
    db.task_logs.push({ id: "l-nap", task_id: "t-nap", pet_id: MOCHI, due_at: ago(30), status: "done", completed_at: ago(20), completed_by: SITTER.id, media_id: "m-nap" });
    const base = { user_id: OWNER.id, pet_id: MOCHI, booking_id: null, read_at: null };
    db.notifications.push(
      { ...base, id: nid(1), type: "task_done", title: "Mochi is asleep 😴", body: "Curled up on the blanket", ref_id: "l-nap", created_at: ago(20) },
      { ...base, id: nid(2), type: "care_checkin", title: "Mochi seems calm 😊", body: null, ref_id: null, created_at: ago(10) },
    );
    await signIn(page, OWNER);
    const screen = app(page);
    await screen.getByTestId("live-updates").waitFor();

    // Only the notice that came with a photo has a thumbnail.
    await expect(screen.getByTestId(`live-${nid(1)}`).getByTestId("notice-thumb")).toBeVisible();
    await expect(screen.getByTestId(`live-${nid(2)}`).getByTestId("notice-thumb")).toHaveCount(0);

    await screen.getByTestId(`live-${nid(1)}`).click();
    await expect(screen.getByTestId("notice-detail-photo")).toBeVisible();
    await expect(screen.getByTestId("notice-detail-memo")).toHaveText("Curled up on the blanket");
    await expect(page).toHaveURL(/\/owner$/); // still Home while the photo is open

    await screen.getByTestId("notice-detail-next").click();
    await expect(page).toHaveURL(new RegExp(`/owner/history\\?pet=${MOCHI}$`));
    await expect(screen.getByTestId("diary-pet").getByRole("radio", { name: "Mochi" })).toHaveAttribute("aria-checked", "true");
  });

  test("Home says which pets are in care right now, with whom and until when", async ({ page }) => {
    const MOCHI = "00000000-0000-4000-8000-0000000000bb";
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    caring(db, [{ id: MAX, name: "Max", species: "dog" }]);
    db.pets.push({ id: MOCHI, owner_id: OWNER.id, species: "cat", name: "Mochi", breed: null, birthdate: null, weight_kg: null, notes: null, created_at: "2026-10-01T09:05:00Z" });
    await signIn(page, OWNER);
    const screen = app(page);
    await expect(screen.getByTestId("in-care-Max")).toContainText("with ");
    await expect(screen.getByTestId("in-care-Max")).toContainText("until");
    await expect(screen.getByTestId("in-care-Mochi")).toHaveCount(0); // Mochi is home
  });

  test("an update you opened leaves Home (it stays in the notification list and History)", async ({ page }) => {
    const db = await ownerHome(page);
    const screen = app(page);
    await screen.getByTestId(`live-${nid(5)}`).click(); // "Max seems calm" → History
    await expect(page).toHaveURL(/\/owner\/history/);
    await page.goto("/owner");
    await screen.getByTestId("live-updates").waitFor();
    await expect(screen.getByTestId(`live-${nid(5)}`)).toHaveCount(0); // seen → gone from Home
    await expect(screen.getByTestId(`live-${nid(3)}`)).toBeVisible(); // unread ones stay
    expect(db.notifications.some((x) => x.id === nid(5))).toBe(true); // …but the notice itself is kept
    expect(db.notifications.find((x) => x.id === nid(5))?.read_at).not.toBeNull();
  });
});
