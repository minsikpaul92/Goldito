import { expect, test } from "@playwright/test";

import { caring, mockUpload } from "./careFixtures";
import { app, signIn } from "./helpers";
import { OWNER, SITTER, mockSupabase } from "./supabaseMock";

// Photo request (Phase 11.1, 014): the owner asks the sitter on duty; the next shared photo answers it.

const MAX = "00000000-0000-4000-8000-0000000000aa";

test.describe("photo request", () => {
  test("the sitter's Home banner opens the pet's feed, and the next shared photo answers the ask", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    caring(db, [{ id: MAX, name: "Max", species: "dog" }]);
    await mockUpload(page, db, MAX);
    await page.route("**/api/ai/caption", (route) => route.fulfill({ status: 502, body: "{}" }));
    db.photo_requests.push({
      id: "pr1", pet_id: MAX, booking_id: "b1", owner_id: OWNER.id, sitter_id: SITTER.id, status: "open",
      fulfilled_post_id: null, fulfilled_at: null, created_at: new Date().toISOString(),
    });
    await signIn(page, SITTER);
    const screen = app(page);

    const banner = screen.getByTestId("home-photo-request");
    await expect(banner).toContainText("asked for a photo of Max");
    await banner.click();
    await expect(page).toHaveURL(new RegExp(`/sitter/feed\\?pet=${MAX}$`));
    await screen.getByTestId("feed-add-photo").click();
    await screen.getByTestId("sample-walk").click();
    await screen.getByTestId("feed-add-save").click();
    await expect(screen.getByTestId("toast")).toContainText("Shared with Robert");

    expect(db.photo_requests[0]).toMatchObject({ status: "fulfilled", fulfilled_post_id: db.feed_posts[0].id });
    const owner = db.notifications.filter((n) => n.user_id === OWNER.id);
    expect(owner.map((n) => n.type)).toEqual(["photo_request_fulfilled"]);

    await page.goto("/sitter");
    await expect(screen.getByTestId("sitter-home")).toBeVisible();
    await expect(screen.getByTestId("home-photo-request")).toHaveCount(0);
  });

  test("the owner's answer notice is in Notifications and opens the pet's feed, like a feed_post", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    caring(db, [{ id: MAX, name: "Max", species: "dog" }]);
    db.notifications.push({
      id: "n-answer", user_id: OWNER.id, type: "photo_request_fulfilled", title: "Here's the photo of Max you asked for 📷",
      body: null, pet_id: MAX, booking_id: "b1", ref_id: null, read_at: null, created_at: new Date().toISOString(),
    });
    await signIn(page, OWNER);
    const screen = app(page);
    await page.goto("/owner/notifications");
    const card = screen.getByTestId("notification-n-answer");
    await expect(card).toContainText("Here's the photo of Max you asked for");
    // No photo on the notice in this mock, so it goes straight to the feed (with one, the detail sheet says See in Feed).
    await card.click();
    await expect(page).toHaveURL(new RegExp(`/owner/feed\\?pet=${MAX}$`));
  });
});
