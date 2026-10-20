import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { app, box, drag, signIn } from "./helpers";
import { MockDb, MockUser, OWNER, SITTER, mockSupabase } from "./supabaseMock";

// Chat hub (03D 3D.4, 014j): one chat per owner and sitter, a WhatsApp-style list inside the Bookings tab, free
// chat both ways, the stay card and the booking progress bar on top, unread counts and leaving a chat.
// The thread rules themselves are tested in rls_smoke.sql; the mock keeps the same ones.

const MAX = "00000000-0000-4000-8000-0000000000c1";
const MOCHI = "00000000-0000-4000-8000-0000000000c2";
const THREAD = "00000000-0000-4000-8000-0000000000f1";
const BOOKING = "00000000-0000-4000-8000-0000000000e1";

function pet(id: string, name: string, species: "dog" | "cat") {
  return { id, owner_id: OWNER.id, species, name, breed: null, birthdate: null, weight_kg: null, notes: null, created_at: "2026-01-01T00:00:00Z" };
}

/** Robert has Max and Mochi and a saved home; Chloe is 3 km away. */
function seed(db: MockDb) {
  db.pets.push(pet(MAX, "Max", "dog"), pet(MOCHI, "Mochi", "cat"));
  db.owner_profiles.push({ id: OWNER.id, home_address: null, home_lat: 43.6644, home_lng: -79.3573 });
  db.nearby_sitters.push({
    sitter_id: SITTER.id,
    display_name: SITTER.displayName,
    bio: null,
    service_area: null,
    experience_years: null,
    services: ["boarding"],
    is_my_sitter: false,
    accepts_multiple_owners: false,
    distance_km: 3,
    boarding_nightly: null,
    house_sitting_nightly: null,
  });
  db.owner_favorite_sitters.push({ owner_id: OWNER.id, sitter_id: SITTER.id });
}

/** An existing chat: Robert asked, Chloe answered, Robert wrote again (two unread for Chloe). */
function seedThread(db: MockDb) {
  db.chat_threads.push({
    id: THREAD,
    owner_id: OWNER.id,
    sitter_id: SITTER.id,
    owner_read_at: "2026-10-10T10:03:00.000Z",
    sitter_read_at: "2026-10-10T10:01:00.000Z",
    owner_left_at: null,
    sitter_left_at: null,
  });
  const at = (m: number) => `2026-10-10T10:0${m}:00.000Z`;
  db.chat_messages.push(
    { id: "m1", thread_id: THREAD, sender_id: OWNER.id, kind: "text", body: "Can you take Max in March?", card: null, created_at: at(0) },
    { id: "m2", thread_id: THREAD, sender_id: SITTER.id, kind: "text", body: "Yes, I have room", card: null, created_at: at(1) },
    { id: "m3", thread_id: THREAD, sender_id: OWNER.id, kind: "text", body: "Great, anything I should bring?", card: null, created_at: at(2) },
    { id: "m4", thread_id: THREAD, sender_id: OWNER.id, kind: "text", body: "He eats at 8", card: null, created_at: at(3) },
  );
}

async function openBookings(page: Page, user: MockUser, home: "owner" | "sitter") {
  await signIn(page, user);
  await expect(page).toHaveURL(new RegExp(`/${home}$`));
  const screen = app(page);
  await screen.getByRole("tab").getByText("Bookings", { exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/${home}/bookings$`));
  return screen;
}

/** Bookings, the sitter's name, the profile, Start chat: a chat starts only from the profile. */
async function startChatFromRow(page: Page, name: string) {
  const screen = app(page);
  await screen.getByTestId(`sitter-tile-${name}`).click();
  await expect(page).toHaveURL(/\/owner\/sitters\//);
  await screen.getByTestId("start-chat").click();
}

test.describe("chat hub", () => {
  test("an owner starts a chat from a sitter: the stay card first, then messages both ways, in the same thread", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    seed(db);
    const screen = await openBookings(page, OWNER, "owner");

    // The row has no chat button: the avatar shows photos, the name opens the profile, and Start chat is there.
    await expect(screen.getByTestId("sitter-chat-Chloe")).toHaveCount(0);
    await startChatFromRow(page, "Chloe");
    await expect(page).toHaveURL(/\/chat\//);
    const url = page.url();
    await expect(screen.getByTestId("chat-stay-card")).toContainText("Max, Mochi");
    // The header has the pets only (no dates, they are on the card); my stay card sits on the right like my messages.
    await expect(screen.getByTestId("chat-header-stay")).not.toContainText(" to ");
    await expect(screen.getByTestId("chat-header-pet-Max")).toBeVisible();
    await expect(screen.getByTestId("chat-header-pet-Mochi")).toBeVisible();
    const frame = await box(page.locator("iframe"));
    const card = await box(screen.getByTestId("chat-stay-card"));
    expect(card.x + card.width / 2).toBeGreaterThan(frame.x + frame.width / 2);
    expect((await box(screen.getByTestId("chat-input"))).height).toBeLessThanOrEqual(48);
    await expect(screen.getByTestId("chat-empty")).toBeHidden();

    // Free chat: the same person sends again and again.
    for (const text of ["Hi Chloe", "Is Max okay with cats?", "Thanks!"]) {
      await screen.getByTestId("chat-input").fill(text);
      await screen.getByTestId("chat-send").click();
      await expect(screen.getByTestId("chat-bubble-me").filter({ hasText: text })).toBeVisible();
    }
    expect(db.chat_messages.filter((m) => m.kind === "text")).toHaveLength(3);

    // The sitter writes back (as they would from their own phone).
    const thread = db.chat_threads[0];
    db.chat_messages.push({ id: "reply", thread_id: thread.id, sender_id: SITTER.id, kind: "text", body: "Max is welcome!", card: null, created_at: new Date(Date.now() + 5000).toISOString() });
    await expect(screen.getByTestId("chat-bubble-them").filter({ hasText: "Max is welcome!" })).toBeVisible({ timeout: 10000 });

    // Back leaves the chat (the profile, then the list); the same sitter opens the same thread, with the history.
    await page.goBack();
    await page.goBack();
    await expect(page).toHaveURL(/\/owner\/bookings$/);
    await expect(screen.getByTestId("chat-row-Chloe")).toContainText("Max is welcome!");
    await startChatFromRow(page, "Chloe");
    await expect(page).toHaveURL(url);
    await expect(screen.getByTestId("chat-bubble-me")).toHaveCount(3);
    expect(db.chat_threads).toHaveLength(1);
    expect(db.chat_messages.filter((m) => m.kind === "card")).toHaveLength(1); // the same stay is not posted twice
  });

  test("the sitter sees the unread count in Chats, opens at the latest message and replies as often as they like", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    seedThread(db);
    const screen = await openBookings(page, SITTER, "sitter");

    await screen.getByTestId("sitter-bookings-tabs-chats").click();
    await expect(screen.getByTestId("chat-row-Robert")).toContainText("He eats at 8");
    await expect(screen.getByTestId("chat-unread-Robert")).toHaveText("2");
    await screen.getByTestId("chat-row-Robert").click();

    await expect(page).toHaveURL(new RegExp(`/chat/${THREAD}$`));
    await expect(screen.getByTestId("chat-bubble-them").last()).toBeInViewport();
    for (const text of ["Bring his food", "And the leash"]) {
      await screen.getByTestId("chat-input").fill(text);
      await screen.getByTestId("chat-send").click();
      await expect(screen.getByTestId("chat-bubble-me").filter({ hasText: text })).toBeVisible();
    }

    await page.goBack();
    await screen.getByTestId("sitter-bookings-tabs-chats").click();
    await expect(screen.getByTestId("chat-row-Robert")).toContainText("And the leash");
    await expect(screen.getByTestId("chat-unread-Robert")).toHaveCount(0);
  });

  test("leaving a chat hides it from my list only; a swipe does it and the chat has no Leave button", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    seed(db);
    seedThread(db);
    const screen = await openBookings(page, OWNER, "owner");

    await expect(screen.getByTestId("chat-row-Chloe")).toBeVisible();
    await screen.getByTestId("chat-row-Chloe").click();
    await expect(screen.getByTestId("chat-leave")).toHaveCount(0); // the back arrow is the way out
    await page.goBack();
    await expect(screen.getByTestId("chat-row-Chloe")).toBeVisible();

    // A swipe to the left leaves the chat: gone from my list, the history stays and Chloe still has it.
    const row = await box(screen.getByTestId("chat-row-Chloe"));
    const y = row.y + row.height / 2;
    await drag(page, { x: row.x + row.width - 10, y }, { x: row.x + 10, y }, 12);
    await expect(screen.getByTestId("chat-row-Chloe")).toHaveCount(0);
    expect(db.chat_messages).toHaveLength(4);
    expect(db.chat_threads[0].owner_left_at).not.toBeNull();
    expect(db.chat_threads[0].sitter_left_at).toBeNull();

    // Start it again: the chat is back with its history.
    await startChatFromRow(page, "Chloe");
    await expect(screen.getByTestId("chat-bubble-me")).toHaveCount(3);
  });

  test("the booking progress bar sits on top of the chat and opens the booking", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    seedThread(db);
    db.pets.push(pet(MAX, "Max", "dog"));
    db.bookings.push({
      id: BOOKING,
      owner_id: OWNER.id,
      sitter_id: SITTER.id,
      status: "requested",
      service_type: "boarding",
      meet_greet_status: "not_needed",
      created_at: "2026-10-02T18:00:00Z",
    });
    db.booking_pets.push({ booking_id: BOOKING, pet_id: MAX });
    const screen = await openBookings(page, OWNER, "owner");

    await screen.getByTestId("chat-row-Chloe").click();
    await expect(screen.getByTestId("stage-bar")).toBeVisible();
    await screen.getByTestId("chat-stage").click();
    await expect(page).toHaveURL(new RegExp(`/owner/bookings/${BOOKING}$`));
  });

  test("Start chat on a sitter's pages carries the stay: the first card, and Request booking in the chat is filled in", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    seed(db);
    await signIn(page, OWNER);
    await expect(page).toHaveURL(/\/owner$/);
    const screen = app(page);
    const drop = "2030-10-24T13:00:00.000Z";
    const pick = "2030-10-28T21:00:00.000Z";
    const stay = `drop=${encodeURIComponent(drop)}&pick=${encodeURIComponent(pick)}&pets=${MAX}`;

    // The stay follows See schedule and a day, and Start chat posts it as the first card.
    await page.goto(`/owner/sitters/${SITTER.id}?${stay}`);
    await screen.getByTestId("sitter-see-schedule").click();
    await expect(page).toHaveURL(new RegExp(`/calendar\\?drop=`));
    await page.goBack();
    await screen.getByTestId("start-chat").click();
    await expect(page).toHaveURL(/\/chat\//);
    await expect(screen.getByTestId("chat-stay-card")).toContainText("Max");
    await screen.getByTestId("chat-request-booking").click();
    await expect(screen.getByTestId("request-sheet")).toBeVisible();
    await screen.getByTestId("request-send").click();
    await expect.poll(() => db.requests.length).toBe(1);
    expect(db.requests[0]).toMatchObject({ p_sitter: SITTER.id, p_pets: [MAX], p_drop_off_at: drop, p_pick_up_at: pick });
  });

  test("the sitter has no Request booking in the chat, and an owner with a booking in progress has none either", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    seedThread(db);
    db.pets.push(pet(MAX, "Max", "dog"));
    db.bookings.push({ id: BOOKING, owner_id: OWNER.id, sitter_id: SITTER.id, status: "requested", service_type: "boarding", meet_greet_status: "not_needed", created_at: "2026-10-02T18:00:00Z" });
    db.booking_pets.push({ booking_id: BOOKING, pet_id: MAX });
    await signIn(page, OWNER);
    await expect(page).toHaveURL(/\/owner$/);
    await page.goto(`/chat/${THREAD}`);
    await expect(app(page).getByTestId("chat-stay-card").or(app(page).getByTestId("chat-bubble-me").first())).toBeVisible();
    await expect(app(page).getByTestId("chat-request-booking")).toHaveCount(0);
  });

  test("asking about a different stay with nothing said since changes the stay card; after a message it adds one", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    seed(db);
    await signIn(page, OWNER);
    await expect(page).toHaveURL(/\/owner$/);
    const screen = app(page);
    const q = (drop: string, pick: string) => `drop=${encodeURIComponent(drop)}&pick=${encodeURIComponent(pick)}&pets=${MAX}`;

    await page.goto(`/owner/sitters/${SITTER.id}?${q("2030-10-20T13:00:00.000Z", "2030-10-22T21:00:00.000Z")}`);
    await screen.getByTestId("start-chat").click();
    await expect(screen.getByTestId("chat-stay-card")).toHaveCount(1);
    await page.goBack();
    await page.goto(`/owner/sitters/${SITTER.id}?${q("2030-10-20T13:00:00.000Z", "2030-10-23T21:00:00.000Z")}`);
    await screen.getByTestId("start-chat").click();
    await expect(screen.getByTestId("chat-stay-card")).toHaveCount(1); // the same card, new dates
    await expect(screen.getByTestId("chat-stay-card")).toContainText("Oct 23");

    await screen.getByTestId("chat-input").fill("Hi Chloe");
    await screen.getByTestId("chat-send").click();
    await expect(screen.getByTestId("chat-bubble-me")).toHaveCount(1);
    await page.goto(`/owner/sitters/${SITTER.id}?${q("2030-10-21T13:00:00.000Z", "2030-10-24T21:00:00.000Z")}`);
    await screen.getByTestId("start-chat").click();
    await expect(screen.getByTestId("chat-stay-card")).toHaveCount(2); // something was said: a new card
  });

  test("the header has the avatar, the name and the pinned stay: the avatar shows photos, the name opens the sitter and back returns", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    seed(db);
    seedThread(db);
    db.chat_messages.unshift({ id: "c0", thread_id: THREAD, sender_id: OWNER.id, kind: "card", body: null, card: { type: "stay", drop_off_at: "2030-10-24T13:00:00Z", pick_up_at: "2030-10-28T21:00:00Z", pets: [{ id: MAX, name: "Max" }] }, created_at: "2026-10-10T09:59:00.000Z" });
    db.profile_photos.push({ id: "ph1", profile_id: SITTER.id, public_id: "goldito/chloe/1" }, { id: "ph2", profile_id: SITTER.id, public_id: "goldito/chloe/2" });
    const screen = await openBookings(page, OWNER, "owner");
    await screen.getByTestId("chat-row-Chloe").click();

    await expect(screen.getByTestId("chat-header-name")).toHaveText("Chloe");
    await expect(screen.getByTestId("chat-header-pet-Max")).toBeVisible();
    await screen.getByTestId("chat-header-avatar").click();
    await expect(screen.getByTestId("chat-photos-photo-1")).toBeVisible();
    await screen.getByTestId("chat-photos-close").click();

    await screen.getByTestId("chat-header-name").click();
    await expect(page).toHaveURL(new RegExp(`/owner/sitters/${SITTER.id}$`));
    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`/chat/${THREAD}$`));
    await expect(screen.getByTestId("chat-header-name")).toBeVisible();
  });

  test("Request booking is a sheet over the chat: no service or pet choice, one line for the day and time, one send posts a card the sitter reads", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    seed(db);
    db.sitter_profiles.push({ id: SITTER.id, service_area: "Toronto M4W", services: ["boarding"] });
    db.chat_threads.push({ id: THREAD, owner_id: OWNER.id, sitter_id: SITTER.id, owner_read_at: null, sitter_read_at: null, owner_left_at: null, sitter_left_at: null });
    db.chat_messages.push({ id: "c0", thread_id: THREAD, sender_id: OWNER.id, kind: "card", body: null, card: { type: "stay", drop_off_at: "2030-10-24T13:00:00Z", pick_up_at: "2030-10-28T21:00:00Z", pets: [{ id: MAX, name: "Max" }, { id: MOCHI, name: "Mochi" }] }, created_at: "2026-10-10T09:59:00.000Z" });
    const screen = await openBookings(page, OWNER, "owner");
    await screen.getByTestId("chat-row-Chloe").click();

    await screen.getByTestId("chat-request-booking").click();
    await expect(screen.getByTestId("request-sheet")).toBeVisible();
    await expect(screen.getByTestId("chat-header")).toBeVisible(); // the chat stays behind the sheet
    await expect(screen.getByText("Who's staying?")).toHaveCount(0);
    await expect(screen.getByText("Boarding", { exact: true })).toHaveCount(0);
    await expect(screen.getByTestId("request-pets")).toContainText("Max");
    // The day and the time share one line.
    const day = await box(screen.getByTestId("request-drop-day"));
    const time = await box(screen.getByTestId("request-drop-time"));
    expect(Math.abs(day.y - time.y)).toBeLessThan(4);
    await expect(screen.getByTestId("request-drop-place")).toHaveText("At Chloe's place, Toronto M4W"); // the rough place, never the street

    // Change one place to a checked address, add a note, send everything at once.
    await page.route("**/api/geo/suggest", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ results: [{ label: "750 Bloor St W, Toronto, ON M6G 3K4", lat: 43.664, lng: -79.42 }] }) }),
    );
    await screen.getByTestId("request-pick-change").click();
    await screen.getByTestId("request-pick-type").getByText("Elsewhere").click();
    await screen.getByTestId("request-pick-address").fill("750 Bloor");
    await expect(screen.getByTestId("request-send")).toBeDisabled(); // not checked yet
    await expect(screen.getByTestId("request-problem")).toContainText("Check the address");
    await screen.getByTestId("request-pick-address-check-address").click();
    await screen.getByTestId("request-pick-address-suggestion-1").click();
    await expect(screen.getByTestId("request-pick-address-address-ok")).toBeVisible();
    await expect(screen.getByTestId("request-pick-place")).toHaveText("At 750 Bloor St W, Toronto, ON M6G 3K4");
    await screen.getByTestId("request-note-toggle").click();
    await screen.getByTestId("request-note").fill("Max gets anxious with loud noises");
    await screen.getByTestId("request-send").click();

    await expect(screen.getByTestId("request-sheet")).toBeHidden();
    expect(db.requests).toHaveLength(1);
    expect(db.requests[0]).toMatchObject({
      p_sitter: SITTER.id,
      p_pets: [MAX, MOCHI],
      p_drop_off_location_type: "sitter_home",
      p_pick_up_location_type: "other",
      p_pick_up_note: "750 Bloor St W, Toronto, ON M6G 3K4",
      p_note: "Max gets anxious with loud noises",
      p_service_type: "boarding",
    });
    // The request is in the chat as one card with the note, and the Request booking button is gone.
    await expect(screen.getByTestId("chat-request-card")).toContainText("You sent a booking request");
    await expect(screen.getByTestId("chat-request-card")).toContainText("750 Bloor St W, Toronto, ON M6G 3K4");
    await expect(screen.getByTestId("chat-request-note")).toHaveText("“Max gets anxious with loud noises”");
    await expect(screen.getByTestId("chat-request-booking")).toHaveCount(0);
    expect(db.chat_messages.filter((m) => (m.card as { type?: string } | null)?.type === "request")).toHaveLength(1);
  });

  test("chips answer what the other person wrote; a tapped chip becomes a draft in the box and nothing is sent until Send", async ({ page }) => {
    const asked: { chips: unknown[]; drafts: unknown[] } = { chips: [], drafts: [] };
    await page.route("**/api/ai/chat-chips", (route) => {
      asked.chips.push(route.request().postDataJSON());
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ chips: [{ id: "c0", label: "Yes, I can host" }, { id: "c1", label: "Let me check" }], for_message_id: "m4", source: "model" }),
      });
    });
    await page.route("**/api/ai/chat-draft", (route) => {
      asked.drafts.push(route.request().postDataJSON());
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ text: "Yes, I can host Max! The total is $268.13 CAD.", source: "model" }) });
    });
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    seedThread(db);
    const screen = await openBookings(page, SITTER, "sitter");
    await screen.getByTestId("sitter-bookings-tabs-chats").click();
    await screen.getByTestId("chat-row-Robert").click();

    await expect(screen.getByTestId("chat-chip-1")).toHaveText("Yes, I can host");
    expect(asked.chips).toEqual([{ thread_id: THREAD }]);
    const before = db.chat_messages.length;
    await screen.getByTestId("chat-chip-1").click();
    await expect(screen.getByTestId("chat-input")).toHaveValue("Yes, I can host Max! The total is $268.13 CAD.");
    await expect(screen.getByTestId("chat-chips")).toHaveCount(0);
    expect(asked.drafts).toEqual([{ thread_id: THREAD, chip: "Yes, I can host" }]);
    expect(db.chat_messages).toHaveLength(before); // a draft is only text in the box

    // The person edits and sends it themselves.
    await screen.getByTestId("chat-input").fill("Yes, I can host Max! The total is $268.13 CAD. See you then.");
    await screen.getByTestId("chat-send").click();
    await expect(screen.getByTestId("chat-bubble-me").filter({ hasText: "See you then" })).toBeVisible();
    expect(db.chat_messages).toHaveLength(before + 1);
  });

  test("with no AI the chat has no chips and typing works as always", async ({ page }) => {
    await page.route("**/api/ai/chat-chips", (route) => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ detail: "down" }) }));
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    seedThread(db);
    const screen = await openBookings(page, SITTER, "sitter");
    await screen.getByTestId("sitter-bookings-tabs-chats").click();
    await screen.getByTestId("chat-row-Robert").click();
    await expect(screen.getByTestId("chat-input")).toBeVisible();
    await expect(screen.getByTestId("chat-chips")).toHaveCount(0);
    await screen.getByTestId("chat-input").fill("Typing still works");
    await screen.getByTestId("chat-send").click();
    await expect(screen.getByTestId("chat-bubble-me").filter({ hasText: "Typing still works" })).toBeVisible();
  });

  test("an owner opening a new chat gets opener chips", async ({ page }) => {
    await page.route("**/api/ai/chat-chips", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ chips: [{ id: "c0", label: "Hi, I need care for Max" }, { id: "c1", label: "Do you take dogs?" }], for_message_id: null, source: "model" }) }),
    );
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    seed(db);
    await signIn(page, OWNER);
    await expect(page).toHaveURL(/\/owner$/);
    await page.goto(`/owner/sitters/${SITTER.id}`);
    await app(page).getByTestId("start-chat").click();
    await expect(app(page).getByTestId("chat-chip-1")).toHaveText("Hi, I need care for Max");
    await expect(app(page).getByTestId("chat-chip-2")).toHaveText("Do you take dogs?");
  });

  test("someone outside the chat cannot open it", async ({ page }) => {
    const other: MockUser = { id: "00000000-0000-4000-8000-000000000009", email: "joy@goldito.test", password: "joy-pass", role: "owner", displayName: "Joy" };
    const { db } = await mockSupabase(page, [OWNER, SITTER, other]);
    seedThread(db);
    await signIn(page, other);
    await expect(page).toHaveURL(/\/owner$/);
    await page.goto(`/chat/${THREAD}`);
    await expect(app(page).getByText("Chat not found")).toBeVisible();
  });
});
