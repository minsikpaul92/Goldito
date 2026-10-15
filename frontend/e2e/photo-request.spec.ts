import { expect, test } from "@playwright/test";

import { caring } from "./careFixtures";
import { app, signIn } from "./helpers";
import { OWNER, SITTER, mockSupabase } from "./supabaseMock";

// Photo request (Phase 11.1, 014): the owner asks the sitter on duty; the next shared photo answers it.

const MAX = "00000000-0000-4000-8000-0000000000aa";
const MOCHI = "00000000-0000-4000-8000-0000000000bb";

test.describe("photo request", () => {
  test("an owner asks once for a pet in care; the button waits until it is answered", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    caring(db, [{ id: MAX, name: "Max", species: "dog" }]);
    db.pets.push({ id: MOCHI, owner_id: OWNER.id, species: "cat", name: "Mochi", breed: null, notes: null });
    await signIn(page, OWNER);
    await expect(page).toHaveURL(/\/owner$/);
    await page.goto(`/owner/feed?pet=${MAX}`);
    const screen = app(page);

    const ask = screen.getByTestId("feed-request-photo");
    await expect(ask).toContainText("Request photo");
    await ask.click();
    await expect(ask).toContainText("Requested · waiting");
    expect(db.photo_requests).toHaveLength(1);
    expect(db.notifications.filter((n) => n.type === "photo_request" && n.user_id === SITTER.id)).toHaveLength(1);

    // Still open after a reload: one ask per pet per stay.
    await page.reload();
    await expect(screen.getByTestId("feed-request-photo")).toContainText("Requested · waiting");

    // Mochi is at home: no button.
    await page.goto(`/owner/feed?pet=${MOCHI}`);
    await expect(screen.getByTestId("owner-feed-list")).toBeVisible();
    await expect(screen.getByTestId("feed-request-photo")).toHaveCount(0);

    // Answered (the feed trigger in 014): the button is back.
    db.photo_requests[0].status = "fulfilled";
    await page.goto(`/owner/feed?pet=${MAX}`);
    await expect(screen.getByTestId("feed-request-photo")).toContainText("Request photo");
  });
});
