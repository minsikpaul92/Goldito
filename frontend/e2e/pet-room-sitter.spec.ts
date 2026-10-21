import { expect, test } from "@playwright/test";

import { caring } from "./careFixtures";
import { NOON_TORONTO, app, signIn } from "./helpers";
import { OWNER, SITTER, mockSupabase } from "./supabaseMock";

// The pet room on the sitter's Home (11.12, #184): the pixel pet and one-tap feed / walk / poop / nap.

const MAX = { id: "00000000-0000-4000-8000-0000000000aa", name: "Max", species: "dog" } as const;
const MOCHI = { id: "00000000-0000-4000-8000-0000000000bb", name: "Mochi", species: "cat" } as const;
const tap = (pet: { id: string }, key: string) => `pet-action-${pet.id}-${key}`;

async function setup(page: import("@playwright/test").Page) {
  // A running clock that starts at noon: the sway and page animations need time to move.
  await page.clock.install({ time: NOON_TORONTO });
  await page.clock.resume();
  const { db } = await mockSupabase(page, [OWNER, SITTER], { now: NOON_TORONTO });
  caring(db, [MAX, MOCHI], NOON_TORONTO);
  db.pets.find((p) => p.id === MAX.id)!.profile = { coat: "cream" };
  await signIn(page, SITTER);
  await app(page).getByTestId("pet-room-Max").waitFor();
  return db;
}

test.describe("sitter pet room", () => {
  test("the pets in care show one at a time as a pixel pet with taps; a cat has no Walk", async ({ page }) => {
    await setup(page);
    const screen = app(page);
    await expect(screen.getByTestId("pet-room-Max-sprite")).toBeVisible();
    await expect(screen.getByTestId("pet-room-Mochi")).toHaveCount(0);
    for (const key of ["feed", "walk", "potty", "nap"]) await expect(screen.getByTestId(tap(MAX, key))).toBeVisible();
    // Nothing logged yet: calm.
    await expect(screen.getByTestId("pet-room-Max-mood")).toHaveText("Calm");
    await screen.getByTestId(`caring-pet-${MOCHI.id}`).click();
    await expect(screen.getByTestId("pet-room-Mochi-sprite")).toBeVisible();
    await expect(screen.getByTestId("pet-room-Max")).toHaveCount(0);
    for (const key of ["feed", "potty", "nap"]) await expect(screen.getByTestId(tap(MOCHI, key))).toBeVisible();
    await expect(screen.getByTestId(tap(MOCHI, "walk"))).toHaveCount(0);
  });

  test("a tap is a check-in: the owner is told and the pet reacts", async ({ page }) => {
    const db = await setup(page);
    const screen = app(page);

    await screen.getByTestId(tap(MAX, "feed")).click();
    await expect(screen.getByTestId("toast")).toContainText("Sent ✅ Robert was told");
    await expect(screen.getByTestId("pet-room-Max")).toContainText("🍽️ Fed");
    expect(db.care_checkins).toHaveLength(1);
    expect(db.care_checkins[0]).toMatchObject({ pet_id: MAX.id, kind: "meal", value: "all", note_text: null, media_id: null });

    await screen.getByTestId(tap(MAX, "walk")).click();
    await expect(screen.getByTestId("pet-room-Max")).toContainText("🦮 20 min");
    await expect(screen.getByTestId("pet-room-Max-mood")).toHaveText("Happy");

    await screen.getByTestId(tap(MAX, "potty")).click();
    await expect(screen.getByTestId("pet-room-Max")).toContainText("💩 Done");
    expect(db.care_checkins.map((c) => [c.kind, c.value])).toEqual([["meal", "all"], ["walk", "20"], ["potty", "normal"]]);

    await screen.getByTestId(tap(MAX, "nap")).click();
    await expect(screen.getByTestId("pet-room-Max-mood")).toHaveText("Sleepy");
    expect(db.care_checkins.at(-1)).toMatchObject({ pet_id: MAX.id, kind: "nap", value: null });
    expect(db.notifications.filter((n) => n.type === "care_checkin" && n.user_id === OWNER.id)).toHaveLength(4);
    // Mochi was not touched.
    expect(db.care_checkins.every((c) => c.pet_id === MAX.id)).toBe(true);
  });

  test("tapping the pet opens the full check-in", async ({ page }) => {
    await setup(page);
    await app(page).getByTestId("pet-room-Max-open").click();
    await expect(page).toHaveURL(new RegExp(`/sitter/checkin/${MAX.id}$`));
  });

  test("a failed tap says so and can be retried", async ({ page }) => {
    const db = await setup(page);
    const screen = app(page);
    // The cat walk is refused by the database; here a missing pet row makes the same kind of refusal.
    let fail = true;
    await page.route("**/rpc/log_care_checkin", async (route) => {
      if (fail) {
        fail = false;
        await route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ code: "P0001", message: "not_in_care_window" }) });
      } else {
        await route.fallback();
      }
    });
    await screen.getByTestId(tap(MAX, "feed")).click();
    await expect(screen.getByText("Not sent")).toBeVisible();
    expect(db.care_checkins).toHaveLength(0);
    await screen.getByRole("button", { name: "Try again" }).click();
    await expect(screen.getByTestId("toast")).toContainText("Sent ✅");
    expect(db.care_checkins).toHaveLength(1);
  });
});
