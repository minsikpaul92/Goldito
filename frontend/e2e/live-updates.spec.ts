import { expect, test } from "@playwright/test";

import { caring } from "./careFixtures";
import { app, signIn } from "./helpers";
import { OWNER, SITTER, mockSupabase } from "./supabaseMock";

// Owner Home while a sitter has the pets, and how Home reaches the sitter's updates (History in Notifications).

const MAX = "00000000-0000-4000-8000-0000000000aa";
const MOCHI = "00000000-0000-4000-8000-0000000000bb";
const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString();

test.describe("owner Home stay", () => {
  test("Home says which pets are in care right now, and with whom", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    caring(db, [{ id: MAX, name: "Max", species: "dog" }]);
    db.pets.push({ id: MOCHI, owner_id: OWNER.id, species: "cat", name: "Mochi", breed: null, birthdate: null, weight_kg: null, notes: null, created_at: "2026-10-01T09:05:00Z" });
    await signIn(page, OWNER);
    const screen = app(page);
    await expect(screen.getByTestId("stay-hero")).toContainText("Max is with ");
    await expect(screen.getByTestId("stay-hero")).not.toContainText("Mochi"); // Mochi is home
  });

  test("the stay's ticket is on Home, and Bookings lists the stay as a plain row (Oct 25)", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    caring(db, [{ id: MAX, name: "Max", species: "dog" }]);
    await signIn(page, OWNER);
    const screen = app(page);
    const ticket = screen.getByTestId("home-stay-ticket");
    await expect(ticket).toContainText("Boarding at");
    await expect(ticket).toContainText("Care");
    await screen.getByRole("tab").getByText("Bookings", { exact: true }).click();
    const row = screen.getByTestId("booking-card-b1");
    await expect(row).toBeVisible();
    await expect(row).not.toContainText("DROP-OFF");
    await screen.getByRole("tab").getByText("Home", { exact: true }).click();
    await ticket.click();
    await expect(page).toHaveURL(/\/owner\/bookings\/b1$/);
  });

  test("with nothing logged yet the tiles read 0/0, 0 and 0m", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    caring(db, [{ id: MAX, name: "Max", species: "dog" }]);
    await signIn(page, OWNER);
    const screen = app(page);
    await expect(screen.getByTestId("stat-tile-care")).toContainText("0/0");
    await expect(screen.getByTestId("stat-tile-photos")).toContainText("0");
    await expect(screen.getByTestId("stat-tile-walks")).toContainText("0m");
  });

  test("the latest update opens its entry in History; Notifications links to History", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    caring(db, [{ id: MAX, name: "Max", species: "dog" }]);
    db.notifications.push({
      id: "n-latest",
      user_id: OWNER.id,
      type: "care_checkin",
      title: "Max ate a little",
      body: "Left the chicken bits",
      pet_id: MAX,
      booking_id: null,
      ref_id: "c-meal",
      read_at: null,
      created_at: ago(5),
    });
    db.care_checkins.push({ id: "c-meal", pet_id: MAX, created_by: SITTER.id, kind: "meal", value: "little", note_text: "Left the chicken bits", media_id: null, created_at: ago(5) });
    await signIn(page, OWNER);
    const screen = app(page);
    await screen.getByTestId("latest-update").click();
    await expect(page).toHaveURL(/\/owner\/history\?pet=.*&entry=checkin-c-meal/);
    await expect(screen.getByTestId("diary-detail")).toContainText("Left the chicken bits");

    await page.goto("/owner/notifications");
    await screen.getByTestId("open-history").click();
    await expect(page).toHaveURL(/\/owner\/history/);
  });
});
