import { expect, test } from "@playwright/test";

import { caring } from "./careFixtures";
import { NOON_TORONTO, app, box, signIn } from "./helpers";
import { OWNER, SITTER, mockSupabase } from "./supabaseMock";

// The pet room on the sitter's Home (11.12, #184): the pixel pet (its preset in the coat or the owner's photo colors)
// and one-tap feed / walk / poop / nap.

const MAX = { id: "00000000-0000-4000-8000-0000000000aa", name: "Max", species: "dog" } as const;
const MOCHI = { id: "00000000-0000-4000-8000-0000000000bb", name: "Mochi", species: "cat" } as const;
const tap = (pet: { id: string }, key: string) => `pet-action-${pet.id}-${key}`;

async function setup(page: import("@playwright/test").Page, maxProfile: object = { coat: "cream" }) {
  // A running clock that starts at noon: the sway and page animations need time to move.
  await page.clock.install({ time: NOON_TORONTO });
  await page.clock.resume();
  const { db } = await mockSupabase(page, [OWNER, SITTER], { now: NOON_TORONTO });
  caring(db, [MAX, MOCHI], NOON_TORONTO);
  db.pets.find((p) => p.id === MAX.id)!.profile = maxProfile;
  await signIn(page, SITTER);
  // The pixel pet room is the back of the Home card: flip to it.
  await app(page).getByTestId("home-pager-flip").click();
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
    await screen.getByTestId("today-caring").getByTestId(`caring-pet-${MOCHI.id}`).click();
    await expect(screen.getByTestId("pet-room-Mochi-sprite")).toBeVisible();
    await expect(screen.getByTestId("pet-room-Max")).toHaveCount(0);
    for (const key of ["feed", "potty", "nap"]) await expect(screen.getByTestId(tap(MOCHI, key))).toBeVisible();
    await expect(screen.getByTestId(tap(MOCHI, "walk"))).toHaveCount(0);
  });

  test("the pet room is the back of the Home card and the biggest thing on it", async ({ page }) => {
    await setup(page);
    const screen = app(page);
    const home = await box(screen.getByTestId("home-pager"));
    const room = await box(screen.getByTestId("pet-room-Max"));
    expect(room.y + room.height).toBeLessThanOrEqual(home.y + home.height + 1);
    expect(room.height).toBeGreaterThan(home.height * 0.45);
    expect((await box(screen.getByTestId("pet-room-Max-sprite"))).height).toBeGreaterThan(home.height * 0.15);
    // The front is the default: flip back and the Quick check-in is there.
    await screen.getByTestId("home-pager-flip").click();
    await expect(screen.getByTestId("quick-heading")).toBeVisible();
  });

  test("a tap is a check-in: the owner is told and the pet reacts", async ({ page }) => {
    const db = await setup(page);
    const screen = app(page);

    await screen.getByTestId(tap(MAX, "feed")).click();
    await expect(screen.getByTestId("toast")).toContainText("Sent. Robert was told");
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

    // The Nap tap is Awake now, and the pet sleeps until it is tapped.
    await expect(screen.getByTestId(tap(MAX, "nap"))).toHaveCount(0);
    await expect(screen.getByTestId(tap(MAX, "wake"))).toContainText("Awake");
    await page.waitForTimeout(1500);
    await expect(screen.getByTestId("pet-room-Max-mood")).toHaveText("Sleepy");
    await screen.getByTestId(tap(MAX, "wake")).click();
    await expect(screen.getByTestId("pet-room-Max-mood")).not.toHaveText("Sleepy");
    await expect(screen.getByTestId(tap(MAX, "nap"))).toBeVisible();
    await expect(screen.getByTestId(tap(MAX, "wake"))).toHaveCount(0);
    expect(db.care_checkins.at(-1)).toMatchObject({ pet_id: MAX.id, kind: "wake", value: null });
    expect(db.notifications.filter((n) => n.type === "care_checkin" && n.user_id === OWNER.id)).toHaveLength(5);
    // Mochi was not touched.
    expect(db.care_checkins.every((c) => c.pet_id === MAX.id)).toBe(true);
  });

  test("the owner's photo colors show here too, and a nap still gets the sleepy face", async ({ page }) => {
    await setup(page, { coat: "cream", pixel_colors: { v: 1, base: "#CC2222", shade: "#661111", light: "#FFAAAA" } });
    const screen = app(page);
    const sprite = screen.getByTestId("pet-room-Max-sprite");
    await expect.poll(() => colorsOf(sprite)).toContain("rgb(204, 34, 34)");
    const awake = await sprite.evaluate((el) => el.innerHTML);

    await screen.getByTestId(tap(MAX, "nap")).click();
    await expect(screen.getByTestId("pet-room-Max-mood")).toHaveText("Sleepy");
    await expect.poll(() => colorsOf(sprite)).toContain("rgb(124, 131, 184)"); // the Z
    expect(await sprite.evaluate((el) => el.innerHTML)).not.toBe(awake);
    expect(await colorsOf(sprite)).toContain("rgb(204, 34, 34)");
  });

  test("tapping the pet opens the full check-in", async ({ page }) => {
    await setup(page);
    await app(page).getByTestId("pet-room-Max-open").click();
    await expect(page).toHaveURL(new RegExp(`/sitter/checkin/${MAX.id}$`));
  });

  test("feeding shows a bowl the pet eats from, then it goes; going potty leaves a poop the room clears", async ({ page }) => {
    await setup(page);
    const screen = app(page);
    // Stop the clock so every tick of the pet is one we run ourselves.
    // (A new check-in is "just now" for 20 seconds, so pause only a moment from now.)
    await page.clock.pauseAt(new Date((await page.evaluate(() => Date.now())) + 1000));
    const sprite = screen.getByTestId("pet-room-Max-sprite");
    const bowl = () => sprite.evaluate((el) => [...el.querySelectorAll("div")].filter((d) => getComputedStyle(d).backgroundColor === "rgb(214, 69, 69)").length);
    expect(await bowl()).toBe(0);

    await screen.getByTestId(tap(MAX, "feed")).click();
    // Let the request and the reload finish (app timers need the clock to move), then the bowl is there.
    await page.clock.runFor(500);
    await expect.poll(bowl).toBeGreaterThan(0);
    await page.clock.runFor(6000);
    await expect.poll(bowl).toBe(0);

    const poops = screen.getByTestId("pet-room-Max-sprite-poop");
    await expect(poops).toHaveCount(0);
    await screen.getByTestId(tap(MAX, "potty")).click();
    await page.clock.runFor(2000);
    await expect(poops).toHaveCount(1);
    await page.clock.runFor(9000);
    await expect(poops).toHaveCount(0);
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
    await expect(screen.getByTestId("toast")).toContainText("Sent");
    expect(db.care_checkins).toHaveLength(1);
  });
});

/** The background colors drawn in a sprite. */
async function colorsOf(sprite: import("@playwright/test").Locator): Promise<string[]> {
  return sprite.evaluate((el) => {
    const seen = new Set<string>();
    el.querySelectorAll("div").forEach((d) => {
      const c = getComputedStyle(d).backgroundColor;
      if (c && c !== "rgba(0, 0, 0, 0)") seen.add(c);
    });
    return [...seen];
  });
}
